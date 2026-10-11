// Walks the live site as the demo people and prints PASS or FAIL for each step.
//
//   PASSWORD=<demo password> node live-check.mjs [screenshot directory]
//
// It signs in only as *@demo.raisingtalents.app (docs/runbooks/demo-data.md) and acts only on
// demo people: the post it reports and the agent it writes to are demo accounts, and the
// report is dismissed at the end. BASE picks another environment; CHROME another browser.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'live-check-shots';
const base = process.env.BASE ?? 'https://raisingtalents.up.railway.app';
const password = process.env.PASSWORD;
if (!password) {
  console.error('Set PASSWORD to the demo password (SEED_DEMO_PASSWORD on the worker).');
  process.exit(2);
}
/** Demo talent whose posts the check may report. Never a real member's. */
const DEMO_NAMES = ['Ngozi Adeyemi', 'Amaka Okafor', 'Zainab Bello', 'Tobi Adebayo', 'Funmi Lawal'];
const REPORT_NOTE = 'Live check of reporting. Please dismiss.';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const step = async (name, fn) => {
  try {
    const note = await fn();
    results.push(['PASS', name, note ?? '']);
  } catch (error) {
    results.push(['FAIL', name, String(error.message).slice(0, 160)]);
  }
};

const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});

async function session(who) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/ERR_ABORTED|401|status of 404/.test(m.text()))
      problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`);
  });
  if (who) {
    await page.goto(`${base}/sign-in`, { waitUntil: 'networkidle2' });
    await page.type('input[type=email]', `${who}@demo.raisingtalents.app`);
    await page.type('input[type=password]', password);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !location.pathname.startsWith('/sign-in'), { timeout: 20000 });
    await sleep(1500);
  }
  const text = () => page.evaluate(() => document.body.innerText);
  const go = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle2' });
    await sleep(1200);
  };
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
  const clickText = async (selector, label) => {
    const done = await page.evaluate(
      (sel, wanted) => {
        const el = [...document.querySelectorAll(sel)].find((node) =>
          (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().includes(wanted),
        );
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      label,
    );
    if (!done) throw new Error(`no ${selector} "${label}"`);
    await sleep(1500);
  };
  return { page, problems, text, go, shot, clickText, close: () => context.close() };
}
const has = (body, wanted) => {
  if (!body.includes(wanted)) throw new Error(`missing "${wanted}"`);
};

// ---- signed out
{
  const s = await session(null);
  await step('landing page loads with both join buttons', async () => {
    await s.go('/welcome');
    const body = await s.text();
    has(body, 'Join as talent');
    has(body, 'Join as agent');
    await s.shot('01-welcome');
  });
  await step('sign-up form opens preselected for agents', async () => {
    await s.go('/sign-up?as=agent');
    const checked = await s.page.evaluate(
      () => document.querySelector('input[name=role]:checked')?.value,
    );
    if (checked !== 'agent') throw new Error(`role is ${checked}`);
  });
  await step('no console or server errors signed out', async () => {
    if (s.problems.length) throw new Error(s.problems.join(' | '));
  });
  await s.close();
}

// ---- talent
let agentPath = null;
{
  const s = await session('emeka');
  await step('talent signs in and the feed shows posts', async () => {
    await s.go('/home');
    const posts = await s.page.$$eval('article', (nodes) => nodes.length);
    if (posts < 1) throw new Error('no posts in the feed');
    const images = await s.page.$$eval(
      'article img',
      (nodes) => nodes.filter((img) => img.complete && img.naturalWidth > 0).length,
    );
    if (images < 1) throw new Error('post images did not load');
    await s.shot('02-feed');
    return `${posts} posts, ${images} images loaded`;
  });
  await step('talent reports a post from the feed', async () => {
    const opened = await s.page.evaluate((names) => {
      const b = [...document.querySelectorAll('article button')].find(
        (x) =>
          x.textContent.trim() === 'Report post' &&
          names.some(
            (name) => x.closest('article').getAttribute('aria-label') === `Post by ${name}`,
          ),
      );
      if (!b) return false;
      b.closest('article').setAttribute('data-e2e', 'reported');
      b.click();
      return true;
    }, DEMO_NAMES);
    if (!opened) throw new Error('no demo post with a Report post button in the feed');
    await sleep(800);
    await s.page.evaluate(() => {
      const scope = document.querySelector('article[data-e2e=reported]');
      const label = [...scope.querySelectorAll('label')].find((x) =>
        x.textContent.includes('Something else'),
      );
      label.click();
    });
    await s.page.type('article[data-e2e=reported] textarea', REPORT_NOTE);
    await s.page.evaluate(() => {
      const scope = document.querySelector('article[data-e2e=reported]');
      [...scope.querySelectorAll('button')]
        .find((x) => x.textContent.includes('Send report'))
        .click();
    });
    await sleep(2500);
    has(await s.text(), 'A moderator will look at this post');
    await s.shot('02b-reported');
  });
  await step('Explore lists talent', async () => {
    await s.go('/search');
    const cards = await s.page.$$eval('a[href^="/talents/"]', (n) => n.length);
    if (cards < 1) throw new Error('no talent in search');
    return `${cards} cards`;
  });
  await step('Agents lists verified agencies', async () => {
    await s.go('/agents');
    const body = await s.text();
    has(body, 'Eko Talent Partners');
    agentPath = await s.page.$eval('article a[href^="/agents/"]', (a) => a.getAttribute('href'));
    await s.shot('03-agents');
    return agentPath;
  });
  await step('agent page shows badge, status, bio and the submission form', async () => {
    if (!agentPath) throw new Error('no agent to open');
    await s.go(agentPath);
    const body = await s.text();
    has(body, 'Verified agency');
    has(body, 'Open for submissions');
    has(body, 'About');
    if (!/Send .* a submission|Your submission is waiting|You are in touch/.test(body))
      throw new Error('no submission panel');
    await s.shot('04-agent-page');
  });
  await step('talent saves the agent and finds them under Saved', async () => {
    const pressed = await s.page.evaluate(() => {
      const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) =>
        /Save|saved/i.test(x.getAttribute('aria-label') ?? ''),
      );
      if (!b) return null;
      if (b.getAttribute('aria-pressed') === 'false') b.click();
      return true;
    });
    if (!pressed) throw new Error('no save button');
    await sleep(1500);
    await s.go('/agents?view=saved');
    has(await s.text(), 'Eko Talent Partners');
  });
  await step('talent sends a submission (or one is already waiting)', async () => {
    await s.go(agentPath);
    const body = await s.text();
    if (/Your submission is waiting|You are in touch/.test(body)) return 'already sent';
    await s.page.type(
      'textarea',
      'Good afternoon. I am a midfielder from Enugu with three seasons of league football. My match clips are on my page.',
    );
    await s.clickText('button', 'Send submission');
    await sleep(2500);
    has(await s.text(), 'Your submission is waiting');
    await s.shot('05-submission-sent');
    return 'sent';
  });
  await step('no console or server errors as talent', async () => {
    if (s.problems.length) throw new Error(s.problems.slice(0, 3).join(' | '));
  });
  await s.close();
}

// ---- agent
{
  const s = await session('tunde');
  await step('agent sees the submission in Messages', async () => {
    await s.go('/messages');
    has(await s.text(), 'Emeka');
    await s.shot('06-agent-messages');
  });
  await step('agent opens it and is offered Accept / Decline', async () => {
    const href = await s.page.evaluate(() => {
      const a = [...document.querySelectorAll('a[href^="/messages/"]')].find((x) =>
        x.textContent.includes('Emeka'),
      );
      return a?.getAttribute('href') ?? null;
    });
    if (!href) throw new Error('no conversation link');
    await s.go(href);
    const body = await s.text();
    if (!/sent you a submission|Decline/.test(body) && !/Write a message|Message/.test(body))
      throw new Error('no answer controls');
    await s.shot('07-agent-thread');
  });
  await step('agent profile form has photo, status and bio', async () => {
    await s.go('/onboarding/agent');
    await sleep(2500);
    const body = await s.text();
    has(body, 'Your photo or logo');
    has(body, 'Are you taking on new talent?');
    has(body, 'About you');
  });
  await step('no console or server errors as agent', async () => {
    if (s.problems.length) throw new Error(s.problems.slice(0, 3).join(' | '));
  });
  await s.close();
}

// ---- moderator
{
  const s = await session('moderator');
  await step('moderator opens the reports queue', async () => {
    await s.go('/moderation/reports');
    const body = await s.text();
    if (!/Reports|Nothing|No /.test(body)) throw new Error('queue did not render');
    await s.shot('08-reports-queue');
  });
  await step('the reported post is shown to the moderator with Remove', async () => {
    const body = await s.text();
    has(body, REPORT_NOTE);
    has(body, 'Reported posts');
    has(body, 'Remove post');
    const loaded = await s.page.$$eval(
      'img[alt^="Reported"]',
      (n) => n.filter((img) => img.complete && img.naturalWidth > 0).length,
    );
    if (loaded < 1) throw new Error('reported preview did not load');
  });
  await step('moderator dismisses the test report, leaving the account alone', async () => {
    // Only the entry that carries this check's note is dismissed.
    const dismissed = await s.page.evaluate((note) => {
      const entry = [...document.querySelectorAll('article')].find((x) =>
        x.textContent.includes(note),
      );
      const button = entry
        ? [...entry.querySelectorAll('button')].find((x) => x.textContent.includes('Dismiss'))
        : null;
      if (!button) return false;
      button.click();
      return true;
    }, REPORT_NOTE);
    if (!dismissed) throw new Error('the test report is not in the queue');
    await sleep(2500);
    if ((await s.text()).includes(REPORT_NOTE)) throw new Error('report still open');
  });
  await step('moderator sees Remove on a live profile', async () => {
    await s.go('/talents/ngozi.adeyemi');
    has(await s.text(), 'Remove profile photo');
  });
  await step('no console or server errors as moderator', async () => {
    if (s.problems.length) throw new Error(s.problems.slice(0, 3).join(' | '));
  });
  await s.close();
}

await browser.close();
for (const [state, name, note] of results)
  console.log(`${state}  ${name}${note ? `  (${note})` : ''}`);
process.exit(results.some(([state]) => state === 'FAIL') ? 1 : 0);

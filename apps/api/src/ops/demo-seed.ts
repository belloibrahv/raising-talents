import type { INestApplicationContext } from '@nestjs/common';
import type { Logger } from 'pino';
import sharp from 'sharp';
import type { AccountsFacade } from '../modules/accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../modules/accounts/application/accounts.tokens.js';
import type { MediaFacade } from '../modules/media/application/media.facade.js';
import { MEDIA } from '../modules/media/application/media.use-cases.js';
import { PLATFORM } from '../platform/platform.tokens.js';
import type { UnitOfWork } from '../platform/unit-of-work.js';

/**
 * Demo people for testing the workflows on a live environment (docs/runbooks/demo-data.md).
 *
 * Runs inside the worker when SEED_DEMO=run, and goes through the API like a person would,
 * so every rule, scan and moderation step applies. Nothing is written to the database
 * directly: it needs EMAIL_VERIFICATION=off (ADR-045), and it approves photos and agencies
 * only once an operator has made the demo moderator a moderator (STAFF_GRANT). Until then it
 * leaves them waiting, like any new member's. Every account uses the DEMO_DOMAIN, so
 * SEED_DEMO=remove can find and erase all of them. Running it again changes nothing that is
 * already in place, and finishes what the moderator could not do before.
 */
export const DEMO_DOMAIN = 'demo.raisingtalents.app';

const DEVICE_ID = '0192a3b4-5c6d-7e8f-9a0b-00000000de00';

interface TalentPersona {
  readonly email: string;
  readonly ip: string;
  readonly displayName: string;
  readonly handle: string;
  readonly category: string;
  readonly subcategory: string;
  readonly city: string;
  readonly bio: string;
  readonly captions: readonly string[];
  readonly palette: number;
  readonly publicLink?: boolean;
  /** Stops after these steps, to show someone part-way through onboarding. */
  readonly onlyFirstSteps?: boolean;
}

const at = (name: string) => `${name}@${DEMO_DOMAIN}`;

const TALENT: readonly TalentPersona[] = [
  {
    email: at('ngozi'),
    ip: '203.0.113.11',
    displayName: 'Ngozi Adeyemi',
    handle: 'ngozi.adeyemi',
    category: 'music',
    subcategory: 'singer',
    city: 'lagos',
    bio: 'Afro-soul singer from Lekki. Two EPs, backing vocals on tour, and a weekly residency at a Victoria Island lounge. Looking for label and festival bookings.',
    captions: ['Live at a Lekki lounge', 'Studio session', 'Festival stage'],
    palette: 0,
    publicLink: true,
  },
  {
    email: at('emeka'),
    ip: '203.0.113.12',
    displayName: 'Emeka Obi',
    handle: 'emeka.obi',
    category: 'sports',
    subcategory: 'football',
    city: 'port-harcourt',
    bio: 'Attacking midfielder from the Rivers United academy. Fourteen goals last season, comfortable on either foot, ready for a trial with a professional club.',
    captions: ['Match day', 'Training ground'],
    palette: 1,
  },
  {
    email: at('amaka'),
    ip: '203.0.113.13',
    displayName: 'Amaka Okafor',
    handle: 'amaka.okafor',
    category: 'acting',
    subcategory: 'film',
    city: 'enugu',
    bio: 'Screen actor with lead roles in two feature films and a web series. Trained at a theatre school in Enugu; strong in drama and comedy in English and Igbo.',
    captions: ['On set', 'Headshot', 'Stage rehearsal'],
    palette: 2,
  },
  {
    email: at('zainab'),
    ip: '203.0.113.14',
    displayName: 'Zainab Bello',
    handle: 'zainab.bello',
    category: 'modelling',
    subcategory: 'runway',
    city: 'abuja',
    bio: 'Runway and editorial model from Abuja. Walked for two fashion weeks and shot campaigns for local designers. Available for runway, print and brand work.',
    captions: ['Runway', 'Editorial'],
    palette: 4,
  },
  {
    email: at('tobi'),
    ip: '203.0.113.15',
    displayName: 'Tobi Adebayo',
    handle: 'tobi.adebayo',
    category: 'sports',
    subcategory: 'athletics',
    city: 'ibadan',
    bio: 'Sprinter from Ibadan. National junior finalist in the 100 metres, training for senior selection and looking for sponsorship and coaching support.',
    captions: ['Track final'],
    palette: 3,
  },
  {
    email: at('funmi'),
    ip: '203.0.113.16',
    displayName: 'Funmi Lawal',
    handle: 'funmi.lawal',
    category: 'content',
    subcategory: 'creator',
    city: 'lagos',
    bio: 'Lifestyle and comedy creator with a growing audience across short-video platforms. Writes, shoots and edits her own sketches; open to brand partnerships.',
    captions: ['Sketch set', 'Behind the scenes'],
    palette: 9,
  },
  {
    email: at('chidi'),
    ip: '203.0.113.17',
    displayName: 'Chidi Okoro',
    handle: 'chidi.okoro',
    category: 'music',
    subcategory: 'guitar',
    city: 'enugu',
    bio: '',
    captions: [],
    palette: 5,
    onlyFirstSteps: true,
  },
];

interface AgentPersona {
  readonly email: string;
  readonly ip: string;
  readonly agencyName: string;
  readonly jobTitle: string;
  readonly specializations: readonly string[];
  readonly city: string;
  readonly website: string;
  /** Verified by the moderator, or left waiting. */
  readonly verified: boolean;
}

const AGENTS: readonly AgentPersona[] = [
  {
    email: at('tunde'),
    ip: '203.0.113.21',
    agencyName: 'Eko Talent Partners',
    jobTitle: 'Senior scout',
    specializations: ['music', 'modelling'],
    city: 'lagos',
    website: 'https://eko-talent.example',
    verified: true,
  },
  {
    email: at('kemi'),
    ip: '203.0.113.22',
    agencyName: 'Northstar Scouting',
    jobTitle: 'Football scout',
    specializations: ['sports'],
    city: 'abuja',
    website: 'https://northstar-scouting.example',
    verified: false,
  },
];

const MODERATOR = { email: at('moderator'), ip: '203.0.113.31' };

const PALETTES: readonly (readonly [string, string, string])[] = [
  ['#f59e0b', '#7c2d12', '#3b1d0f'],
  ['#06b6d4', '#164e63', '#2b1a10'],
  ['#f43f5e', '#4c0519', '#4a2a1a'],
  ['#84cc16', '#1a2e05', '#2f1b0e'],
  ['#a855f7', '#2e1065', '#3d2314'],
  ['#fb923c', '#431407', '#24130a'],
  ['#14b8a6', '#042f2e', '#4b2c1c'],
  ['#3b82f6', '#172554', '#2d190c'],
  ['#eab308', '#422006', '#3a2416'],
  ['#ec4899', '#500724', '#2a160b'],
];

/** An illustrated portrait, so no real person's likeness is used. */
async function portrait(palette: number): Promise<Buffer> {
  const [light, dark, skin] = PALETTES[palette % PALETTES.length] ?? [
    '#f59e0b',
    '#7c2d12',
    '#3b1d0f',
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <defs>
    <radialGradient id="bg" cx="${String(30 + ((palette * 13) % 50))}%" cy="20%" r="95%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
    <linearGradient id="cloth" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="#0b0b14"/></linearGradient>
  </defs>
  <rect width="800" height="1000" fill="url(#bg)"/>
  <circle cx="${String(620 - palette * 20)}" cy="${String(160 + palette * 15)}" r="${String(120 + palette * 6)}" fill="#ffffff" opacity="0.08"/>
  <path d="M120 1000 C130 760 250 690 400 690 C550 690 670 760 680 1000 Z" fill="url(#cloth)"/>
  <rect x="352" y="560" width="96" height="150" rx="40" fill="${skin}"/>
  <ellipse cx="400" cy="450" rx="150" ry="178" fill="${skin}"/>
  <path d="M245 430 C240 280 330 230 400 232 C480 230 565 280 556 430 C540 360 470 330 400 330 C330 330 262 360 245 430 Z" fill="#120a06"/>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

class DemoApi {
  constructor(
    private readonly baseUrl: string,
    private readonly proxySecret: string | undefined,
  ) {}

  // The caller states what it expects back; the API's contract tests keep that honest.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  async call<T = unknown>(
    method: string,
    path: string,
    options: { token?: string; ip: string; body?: unknown; ifMatch?: number },
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (options.token) headers['authorization'] = `Bearer ${options.token}`;
    if (options.ifMatch !== undefined) headers['if-match'] = `"${String(options.ifMatch)}"`;
    // Each demo person gets their own address, as real people would, for the per-IP limits.
    if (this.proxySecret) {
      headers['x-proxy-secret'] = this.proxySecret;
      headers['x-forwarded-for'] = options.ip;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
  }

  async expect<T = unknown>(
    method: string,
    path: string,
    options: { token?: string; ip: string; body?: unknown; ifMatch?: number },
  ): Promise<T> {
    const result = await this.call<T>(method, path, options);
    if (result.status >= 400) {
      throw new Error(
        `${method} ${path} answered ${String(result.status)}: ${JSON.stringify(result.body)}`,
      );
    }
    return result.body;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Taxonomy {
  categories: { slug: string; name: string; subcategories: { slug: string; name: string }[] }[];
}

/** The demo people live in Nigeria; their cities come from its list (ADR-046). */
const DEMO_COUNTRY = 'NG';

/** The live taxonomy decides the slugs: pick the closest match, or the first. */
function pick<T extends { slug: string; name: string }>(items: readonly T[], hint: string): T {
  const found =
    items.find((item) => item.slug === hint) ??
    items.find((item) => item.slug.includes(hint) || item.name.toLowerCase().includes(hint));
  const chosen = found ?? items[0];
  if (!chosen) throw new Error(`Nothing to choose for ${hint}`);
  return chosen;
}

export async function runDemoSeed(app: INestApplicationContext, logger: Logger): Promise<void> {
  const password = process.env['SEED_DEMO_PASSWORD'];
  if (!password || password.length < 12) {
    logger.error('SEED_DEMO_PASSWORD (12+ characters) is required to seed demo data');
    return;
  }
  const api = new DemoApi(
    process.env['SEED_API_URL'] ?? 'http://api.railway.internal:8080',
    process.env['PROXY_SECRET'],
  );
  const accounts = app.get<AccountsFacade>(ACCOUNTS.Facade);
  const report: string[] = [];

  /** Signs up, or signs in when the account is already there. Returns an access token. */
  async function account(email: string, ip: string, role: 'talent' | 'agent' | null) {
    const existing = await accounts.findSummaryByEmail(email);
    const auth = existing
      ? await api.expect<{ tokens: { accessToken: string }; me: { id: string } }>(
          'POST',
          '/v1/auth/sign-in',
          { ip, body: { email, password, deviceId: DEVICE_ID } },
        )
      : await api.expect<{ tokens: { accessToken: string }; me: { id: string } }>(
          'POST',
          '/v1/auth/sign-up',
          {
            ip,
            body: {
              email,
              password,
              dateOfBirth: '1998-05-14',
              countryCode: 'NG',
              acceptedTerms: true,
              deviceId: DEVICE_ID,
            },
          },
        );
    const id = auth.me.id;
    const me = await api.expect<{ role: string | null }>('GET', '/v1/me', {
      ip,
      token: auth.tokens.accessToken,
    });
    if (role && me.role === null) {
      await api.expect('POST', '/v1/me/role', {
        ip,
        token: auth.tokens.accessToken,
        body: { role },
      });
    }
    return { id, token: auth.tokens.accessToken, ip };
  }

  // Seeded accounts must start verified; that is what EMAIL_VERIFICATION=off is for.
  if (process.env['EMAIL_VERIFICATION'] !== 'off') {
    logger.error('Demo data needs EMAIL_VERIFICATION=off on the api and the worker (ADR-045)');
    return;
  }
  // The moderator's account is an ordinary one: an operator grants the role (STAFF_GRANT).
  const moderator = await account(MODERATOR.email, MODERATOR.ip, null);
  const canModerate = (await accounts.profileContext(moderator.id))?.role === 'moderator';
  report.push(
    canModerate
      ? `moderator: ${MODERATOR.email}`
      : `moderator account: ${MODERATOR.email} (not a moderator yet: photos and agencies wait for STAFF_GRANT)`,
  );

  const taxonomy = await api.expect<Taxonomy>('GET', '/v1/taxonomy', {
    ip: moderator.ip,
    token: moderator.token,
  });
  const cities = (
    await api.expect<{ items: { slug: string; name: string }[] }>(
      'GET',
      `/v1/taxonomy/countries/${DEMO_COUNTRY}/cities`,
      { ip: moderator.ip, token: moderator.token },
    )
  ).items;

  /** Uploads through the real pipeline and approves it as the moderator. */
  async function upload(
    owner: { token: string; ip: string },
    purpose: 'avatar' | 'portfolio',
    file: Buffer,
  ): Promise<string> {
    const intent = await api.expect<{
      mediaId: string;
      upload: { url: string; fields: Record<string, string> };
    }>('POST', '/v1/media/upload-intents', {
      ...owner,
      body: { purpose, contentType: 'image/jpeg', bytes: file.length },
    });
    const form = new FormData();
    for (const [name, value] of Object.entries(intent.upload.fields)) form.append(name, value);
    form.append('file', new Blob([new Uint8Array(file)], { type: 'image/jpeg' }));
    const stored = await fetch(intent.upload.url, { method: 'POST', body: form });
    if (!stored.ok) throw new Error(`Storage refused the upload: ${String(stored.status)}`);
    await api.expect('POST', `/v1/media/${intent.mediaId}/complete`, owner);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const media = await api.expect<{ status: string }>(
        'GET',
        `/v1/media/${intent.mediaId}`,
        owner,
      );
      if (media.status === 'ready') return intent.mediaId;
      if (media.status === 'held_for_review') {
        if (!canModerate) return intent.mediaId;
        await api.expect('POST', `/v1/moderation/media/${intent.mediaId}/decision`, {
          ...moderator,
          body: { decision: 'approve' },
        });
      }
      if (media.status === 'rejected' || media.status === 'failed') {
        throw new Error(`Upload ${intent.mediaId} ended ${media.status}`);
      }
      await sleep(2000);
    }
    throw new Error(`Upload ${intent.mediaId} did not finish in time`);
  }

  const talentAccounts = new Map<string, { id: string; token: string; ip: string }>();
  for (const persona of TALENT) {
    const talent = await account(persona.email, persona.ip, 'talent');
    talentAccounts.set(persona.handle, talent);
    type Profile = {
      version: number;
      isComplete: boolean;
      avatarMediaId: string | null;
      photoInReview: boolean;
      publicLink: boolean;
      handle: string;
    };
    const current = await api.call<Profile>('GET', '/v1/me/talent-profile', talent);
    let profile = current.status === 200 ? current.body : null;
    if (!profile) {
      profile = await api.expect<Profile>('PATCH', '/v1/me/talent-profile', {
        ...talent,
        body: { displayName: persona.displayName, handle: persona.handle },
      });
    }
    const category = pick(taxonomy.categories, persona.category);
    const subcategory = pick(category.subcategories, persona.subcategory);
    if (!profile.isComplete && !profile.photoInReview) {
      profile = await api.expect<Profile>('PATCH', '/v1/me/talent-profile', {
        ...talent,
        ifMatch: profile.version,
        body: {
          categorySlug: category.slug,
          subcategorySlugs: [subcategory.slug],
          ...(persona.onlyFirstSteps
            ? {}
            : { citySlug: pick(cities, persona.city).slug, bio: persona.bio }),
        },
      });
    }
    if (persona.onlyFirstSteps) {
      report.push(`talent (part-way through onboarding): ${persona.email}`);
      continue;
    }
    if (!profile.avatarMediaId && !profile.photoInReview) {
      await upload(talent, 'avatar', await portrait(persona.palette));
    }
    const portfolio = await api.expect<{ items: unknown[] }>('GET', '/v1/me/portfolio', talent);
    if (portfolio.items.length === 0) {
      for (const [index, caption] of persona.captions.entries()) {
        const mediaId = await upload(
          talent,
          'portfolio',
          await portrait(persona.palette + index + 3),
        );
        await api.expect('POST', '/v1/me/portfolio/items', {
          ...talent,
          body: { mediaId, caption },
        });
      }
    }
    // The worker changes the profile when the photo is held or approved: read it again first.
    profile = await api.expect<Profile>('GET', '/v1/me/talent-profile', talent);
    if (persona.publicLink && !profile.publicLink) {
      profile = await api.expect<Profile>('PATCH', '/v1/me/talent-profile', {
        ...talent,
        ifMatch: profile.version,
        body: { publicLink: true },
      });
    }
    report.push(`talent: ${persona.email} (@${persona.handle})`);
  }

  const agentAccounts = new Map<string, { id: string; token: string; ip: string }>();
  for (const persona of AGENTS) {
    const agent = await account(persona.email, persona.ip, 'agent');
    agentAccounts.set(persona.email, agent);
    const current = await api.call<{ version: number; isComplete: boolean }>(
      'GET',
      '/v1/me/agent-profile',
      agent,
    );
    if (current.status !== 200 || !current.body.isComplete) {
      await api.expect('PATCH', '/v1/me/agent-profile', {
        ...agent,
        ...(current.status === 200 ? { ifMatch: current.body.version } : {}),
        body: {
          agencyName: persona.agencyName,
          jobTitle: persona.jobTitle,
          specializationSlugs: persona.specializations.map(
            (hint) => pick(taxonomy.categories, hint).slug,
          ),
          citySlug: pick(cities, persona.city).slug,
          website: persona.website,
        },
      });
    }
    const verification = await api.expect<{ state: string }>(
      'GET',
      '/v1/me/agent-verification',
      agent,
    );
    if (verification.state === 'not_requested') {
      await api.expect('POST', '/v1/me/agent-verification', {
        ...agent,
        body: {
          evidenceUrl: `${persona.website}/team`,
          note: 'Demo agency for testing.',
        },
      });
    }
    if (canModerate && persona.verified && verification.state !== 'verified') {
      const queue = await api.expect<{ items: { id: string; agentId: string }[] }>(
        'GET',
        '/v1/moderation/agent-verifications',
        moderator,
      );
      const request = queue.items.find((item) => item.agentId === agent.id);
      if (request) {
        await api.expect('POST', `/v1/moderation/agent-verifications/${request.id}/decision`, {
          ...moderator,
          body: { decision: 'approve' },
        });
      }
    }
    const state = (await api.expect<{ state: string }>('GET', '/v1/me/agent-verification', agent))
      .state;
    report.push(`agent: ${persona.email} (${persona.agencyName}, verification ${state})`);
  }

  if (!canModerate) {
    logger.warn(
      { seeded: report },
      'demo data is in place; set STAFF_GRANT for the demo moderator and run again to approve photos and agencies',
    );
    return;
  }

  // Photos sent before the moderator had the role are still waiting: approve the demo ones.
  const demoIds = new Set([...talentAccounts.values()].map((talent) => talent.id));
  const held = await api.expect<{ items: { id: string; ownerId: string }[] }>(
    'GET',
    '/v1/moderation/media',
    moderator,
  );
  for (const item of held.items.filter((entry) => demoIds.has(entry.ownerId))) {
    await api.expect('POST', `/v1/moderation/media/${item.id}/decision`, {
      ...moderator,
      body: { decision: 'approve' },
    });
  }
  // The worker attaches approved photos, which makes the profiles visible to agents.
  for (const persona of TALENT.filter((entry) => !entry.onlyFirstSteps)) {
    const talent = talentAccounts.get(persona.handle);
    if (!talent) continue;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const profile = await api.expect<{ isComplete: boolean }>(
        'GET',
        '/v1/me/talent-profile',
        talent,
      );
      if (profile.isComplete) break;
      await sleep(2000);
    }
  }

  // Conversations, so messaging can be tried from both sides at once.
  const tunde = agentAccounts.get(at('tunde'));
  const ngozi = talentAccounts.get('ngozi.adeyemi');
  const zainab = talentAccounts.get('zainab.bello');
  if (tunde && ngozi && zainab) {
    const conversationWith = async (handle: string) => {
      const found = await api.call<{ id: string; status: string }>(
        'GET',
        `/v1/me/conversations/with/${handle}`,
        tunde,
      );
      return found.status === 200 ? found.body : null;
    };
    let chat = await conversationWith('ngozi.adeyemi');
    if (!chat) {
      chat = await api.expect('POST', '/v1/talents/ngozi.adeyemi/contact', {
        ...tunde,
        body: {
          message:
            'Good afternoon Ngozi! I scout vocalists for Eko Talent Partners. We loved your live set and have a paid studio booking next month. Would you be open to a chat?',
          clientMessageId: '0192a3b4-0000-7000-8000-00000000de01',
        },
      });
    }
    if (chat?.status === 'requested') {
      await api.expect('POST', `/v1/me/conversations/${chat.id}/response`, {
        ...ngozi,
        body: { decision: 'accept' },
      });
      await api.expect('POST', `/v1/me/conversations/${chat.id}/messages`, {
        ...ngozi,
        body: {
          body: 'Thank you! I would love to hear more about the booking.',
          clientMessageId: '0192a3b4-0000-7000-8000-00000000de02',
        },
      });
      await api.expect('POST', `/v1/me/conversations/${chat.id}/messages`, {
        ...tunde,
        body: {
          body: 'Wonderful. It is three days in Ikoyi. Are you free the week of the 20th?',
          clientMessageId: '0192a3b4-0000-7000-8000-00000000de03',
        },
      });
    }
    if (!(await conversationWith('zainab.bello'))) {
      await api.expect('POST', '/v1/talents/zainab.bello/contact', {
        ...tunde,
        body: {
          message:
            'Hello Zainab, we are casting for a runway show in Lagos next month and think you would be a great fit. Can we talk?',
          clientMessageId: '0192a3b4-0000-7000-8000-00000000de04',
        },
      });
    }
    report.push(
      'conversations: Eko Talent Partners with Ngozi (chat), with Zainab (request waiting)',
    );
  }

  logger.warn({ seeded: report }, 'demo data is in place');
}

/** Erases every demo account, and its files, the way account deletion does. */
export async function removeDemoData(app: INestApplicationContext, logger: Logger): Promise<void> {
  const accounts = app.get<AccountsFacade>(ACCOUNTS.Facade);
  const media = app.get<MediaFacade>(MEDIA.Facade);
  const uow = app.get<UnitOfWork>(PLATFORM.UnitOfWork);
  const emails = [MODERATOR.email, ...TALENT.map((t) => t.email), ...AGENTS.map((a) => a.email)];
  const removed: string[] = [];
  for (const email of emails) {
    const found = await accounts.findSummaryByEmail(email);
    if (!found) continue;
    await media.purgeOwnerFiles(found.id);
    await uow.run(() => accounts.erase(found.id));
    removed.push(email);
  }
  logger.warn({ removed }, 'demo data removed');
}

import type { MyTalentProfile } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { firstOpenStep, nextStep, previousStep } from './steps';

const profile = (missing: MyTalentProfile['missing']) => ({ missing }) as MyTalentProfile;

describe('talent onboarding steps', () => {
  it('starts at the beginning before anything is saved', () => {
    expect(firstOpenStep(null)).toBe('about');
  });

  it('resumes at the first step with something missing, in wizard order', () => {
    expect(firstOpenStep(profile(['avatar', 'bio', 'city']))).toBe('location');
    expect(firstOpenStep(profile(['subcategories']))).toBe('discipline');
    expect(firstOpenStep(profile(['avatar']))).toBe('photo');
  });

  it('has nowhere to resume once complete', () => {
    expect(firstOpenStep(profile([]))).toBeNull();
  });

  it('walks forwards and backwards with ends', () => {
    expect(nextStep('story')).toBe('photo');
    expect(nextStep('photo')).toBeNull();
    expect(previousStep('about')).toBeNull();
    expect(previousStep('discipline')).toBe('about');
  });
});

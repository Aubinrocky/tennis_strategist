import { DEFAULT_PROFILE, type PlayerProfile } from '../domain/types';

const PROFILE_KEY = 'tennis-strategy.profile.v1';

export function loadProfile(): PlayerProfile {
  try {
    const saved = window.localStorage.getItem(PROFILE_KEY);
    return saved ? { ...DEFAULT_PROFILE, ...JSON.parse(saved) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(profile: PlayerProfile) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}


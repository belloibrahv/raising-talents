export const TALENT = {
  Repository: Symbol('TalentProfileRepository'),
  Accounts: Symbol('TalentProfileAccounts'),
  UpdateMine: Symbol('UpdateMyTalentProfileHandler'),
  GetMine: Symbol('GetMyTalentProfileQuery'),
  GetPublic: Symbol('GetPublicTalentProfileQuery'),
  EventHandlers: Symbol('TalentProfileEventHandlers'),
} as const;

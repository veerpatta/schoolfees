export type SetupLockedReason = "policy" | "master_data" | "defaults";

export function getSetupLockedMessage(reason: SetupLockedReason) {
  switch (reason) {
    case "policy":
      return "Initial setup is already marked complete. Use Fee Setup for live policy and fee-default changes.";
    case "defaults":
      return "Initial setup is already marked complete. Use Fee Setup for live default changes.";
    case "master_data":
    default:
      return "Initial setup is already marked complete. Use School Setup Lists for live class and route changes.";
  }
}


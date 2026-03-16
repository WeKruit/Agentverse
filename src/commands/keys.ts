import { Command } from "commander";

export const keysCommand = new Command("keys")
  .description("Manage cryptographic keys")
  .addCommand(
    new Command("show")
      .description("Show public key and DID")
      .action(async () => {
        console.log("Your identity:");
        // TODO: Display did:jwk, public keys
        console.log("  [not yet implemented]");
      })
  )
  .addCommand(
    new Command("export")
      .description("Export public key")
      .option("--format <fmt>", "Format: jwk | multibase", "jwk")
      .action(async (options) => {
        // TODO: Export public key
        console.log("  [not yet implemented]");
      })
  )
  .addCommand(
    new Command("revoke")
      .description("Revoke current keys and re-issue credentials")
      .action(async () => {
        console.log("WARNING: This will invalidate all existing credentials.");
        // TODO: Generate new key pair
        // TODO: Re-issue all credentials
        // TODO: Mark old DID as deactivated
        // TODO: Write revocation event to audit log
        console.log("  [not yet implemented]");
      })
  );

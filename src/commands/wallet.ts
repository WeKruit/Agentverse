import { Command } from "commander";

export const walletCommand = new Command("wallet")
  .description("Manage credential wallet")
  .addCommand(
    new Command("list")
      .description("List all credentials")
      .action(async () => {
        console.log("Credentials in wallet:");
        // TODO: List credentials with metadata
        console.log("  [not yet implemented]");
      })
  )
  .addCommand(
    new Command("show")
      .description("Show credential details")
      .argument("<id>", "Credential ID or type")
      .action(async (id) => {
        console.log(`Credential: ${id}`);
        // TODO: Display credential details
        console.log("  [not yet implemented]");
      })
  )
  .addCommand(
    new Command("issue")
      .description("Issue credentials from extracted profile")
      .action(async () => {
        console.log("Issuing credentials from profile...");
        // TODO: Read profile, generate BBS+ signed VCs
        console.log("  [not yet implemented]");
      })
  );

import { BridgeTool } from "./types";
import { ConversationStore } from "../store";

export const rememberFactTool: BridgeTool = {
  name: "remember_fact",
  description:
    "Save a specific fact about the contact that should be remembered indefinitely (e.g., gate codes, allergies, preferences, names of family members).",
  parameters: {
    number: {
      type: "string",
      description: "The phone number of the contact (e.g. +1234567890)",
      required: true,
    },
    fact: {
      type: "string",
      description: "The fact to remember (e.g. 'Gate code is 1234')",
      required: true,
    },
  },
  async execute(args) {
    const number = String(args.number ?? "");
    const fact = String(args.fact ?? "");

    if (!number || !fact) return { error: "Missing 'number' or 'fact'" };

    const store = await ConversationStore.open();
    try {
      store.saveFact(number, fact);
      return { saved: true };
    } finally {
      store.close();
    }
  },
};

export const searchFactsTool: BridgeTool = {
  name: "search_facts",
  description:
    "Retrieve all previously saved facts for a specific contact number.",
  parameters: {
    number: {
      type: "string",
      description: "The phone number of the contact",
      required: true,
    },
  },
  async execute(args) {
    const number = String(args.number ?? "");
    if (!number) return { error: "Missing 'number'" };

    const store = await ConversationStore.open();
    try {
      const facts = store.getFacts(number);
      return { facts };
    } finally {
      store.close();
    }
  },
};

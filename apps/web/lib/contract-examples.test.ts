import { DEFAULT_POLICY, loadModel, modelProvider, parseMinor, priceMenu } from "@stumari/core";
import modelJson from "@stumari/core/model/model.json";
import { describe, expect, it } from "vitest";
import en from "../messages/en.json";
import ka from "../messages/ka.json";
import ru from "../messages/ru.json";
import { contractExamples, EXAMPLE_BASE_MINOR, examplePCancelPercent, exampleRequests } from "./contract-examples";
import { contractTemplates } from "./db/schema";

const provider = modelProvider(loadModel(modelJson));
const menus = exampleRequests.map((request) =>
  priceMenu({ provider, request, policy: DEFAULT_POLICY, basePriceMinor: EXAMPLE_BASE_MINOR }),
);

describe("landing contract examples", () => {
  it("are the committed model's menus for the stated requests", () => {
    expect(menus.map((m) => m.explain.lead_time)).toEqual([60, 2]);
    menus.forEach((menu, i) => {
      const prices = Object.fromEntries(
        contractTemplates.map((id) => {
          const option = menu.explain.options.find((o) => o.id === id);
          return [id, option?.price_minor != null && option.withheld === null ? parseMinor(option.price_minor) : null];
        }),
      );
      expect(prices).toEqual(contractExamples[i]);
    });
  });

  it("state P(cancel) rounded to a whole percent, in every locale", () => {
    expect(menus.map((m) => Math.round(m.explain.p_cancel * 100))).toEqual(examplePCancelPercent);
    for (const dict of [en, ka, ru]) {
      dict.model.compare.guests.forEach((guest, i) => {
        expect(guest.detail).toMatch(new RegExp(`(^|\\D)${examplePCancelPercent[i]}%`));
      });
    }
  });
});

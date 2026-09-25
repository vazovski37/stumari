"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorNote } from "@/components/operator/ui";
import { useAction } from "@/components/operator/use-action";
import { apiPost } from "@/lib/client/api";

/** A draft hotel without an application (e.g. onboarded from a call); opens the onboarding steps. */
export function NewHotelForm() {
  const router = useRouter();
  const { run, busy, error } = useAction();
  const [name, setName] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const hotel = await run("create", () => apiPost<{ id: string }>("/api/admin/hotels", { name }));
        if (hotel) router.push(`/admin/hotels/${hotel.id}`);
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm font-medium">
          New hotel name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="field" />
        </label>
        <button type="submit" disabled={busy !== null} className="btn btn-primary !py-2.5 disabled:opacity-60">
          <Plus aria-hidden="true" className="size-4" />
          {busy ? "Creating…" : "Create draft"}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

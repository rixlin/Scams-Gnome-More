"use client";

import React, { useState } from "react";
import { Sliders, Check, AlertCircle, RefreshCw, UserCheck } from "lucide-react";
import { GnomeProfile } from "../../lib/types";
import { updateGnomeLive } from "../../lib/api";

interface GnomeLiveEditorProps {
  callId: string;
  gnome: GnomeProfile;
  isCallActive?: boolean;
  onGnomeUpdated?: () => void;
}

export const GnomeLiveEditor: React.FC<GnomeLiveEditorProps> = ({
  callId,
  gnome,
  isCallActive = true,
  onGnomeUpdated,
}) => {
  const [personalityText, setPersonalityText] = useState(gnome.personality || "");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSavePersonality = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!callId) return;

    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      await updateGnomeLive(callId, {
        personality: personalityText.trim() || undefined,
      });

      setSuccessMsg("Gnome personality updated in real-time.");
      if (onGnomeUpdated) onGnomeUpdated();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update Gnome.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-100">Gnome Persona &amp; Demeanor</h3>
        </div>
        {isCallActive ? (
          <span className="text-[10px] text-emerald-400 font-mono px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40">
            Live Edits Enabled
          </span>
        ) : (
          <span className="text-[10px] text-zinc-500 font-mono">
            Read Only (Call Ended)
          </span>
        )}
      </div>

      {/* Assigned Gnome Profile */}
      <div className="p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-300">
            {gnome.name || "Assigned Gnome"}
          </span>
        </div>
        {gnome.backstory && (
          <p className="text-xs text-zinc-400 leading-relaxed italic border-l-2 border-emerald-500/40 pl-2.5">
            &quot;{gnome.backstory}&quot;
          </p>
        )}
      </div>

      {/* Feedback Messages */}
      {successMsg && (
        <div className="flex items-center gap-2 p-2.5 text-xs rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 p-2.5 text-xs rounded-lg bg-red-950/40 border border-red-800/60 text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Personality Form */}
      <form onSubmit={handleSavePersonality} className="space-y-3">
        <div>
          <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
            Live Personality &amp; Demeanor
          </label>
          <textarea
            disabled={!isCallActive || submitting}
            rows={3}
            value={personalityText}
            onChange={(e) => setPersonalityText(e.target.value)}
            placeholder="e.g. Speaks slowly, tangents into gardening stories, mildly confused..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/80 disabled:opacity-50 resize-none font-sans"
          />
        </div>

        {isCallActive && (
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Save Personality Changes
          </button>
        )}
      </form>
    </div>
  );
};

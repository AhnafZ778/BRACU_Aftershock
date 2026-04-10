import { create } from 'zustand';
import { fetchCopilotState } from '../services/copilotService';
import type { CopilotState } from '../types/copilot';

interface CopilotStore {
  eventId: string;
  selectedBranchId: string | null;
  aiEnhance: boolean;
  isLoading: boolean;
  error: string | null;
  data: CopilotState | null;
  fetchedStepIndex: number | null;
  cache: Record<string, CopilotState>;

  setEventId: (eventId: string) => void;
  setSelectedBranchId: (branchId: string | null) => void;
  setAiEnhance: (enabled: boolean) => void;
  fetchState: (stepIndex: number, opts?: { forceRefresh?: boolean }) => Promise<void>;
  clearForecast: () => void;
}

export const useCopilotStore = create<CopilotStore>((set, get) => ({
  eventId: 'sidr_2007',
  selectedBranchId: null,
  aiEnhance: false,
  isLoading: false,
  error: null,
  data: null,
  fetchedStepIndex: null,
  cache: {},

  setEventId: (eventId) => set({ eventId }),
  setSelectedBranchId: (branchId) => set((state) => ({
    selectedBranchId: branchId,
    data: branchId && state.data
      ? { ...state.data, selected_branch_id: branchId }
      : state.data,
  })),
  setAiEnhance: (enabled) => set({ aiEnhance: enabled }),
  clearForecast: () => set({ data: null, fetchedStepIndex: null, error: null }),

  fetchState: async (stepIndex, opts) => {
    const { eventId, selectedBranchId, cache } = get();
    const forceRefresh = Boolean(opts?.forceRefresh);
    const cacheKey = [
      eventId,
      String(stepIndex),
      selectedBranchId ?? 'auto',
      'det',
    ].join('|');

    const cached = cache[cacheKey];
    if (cached && !forceRefresh) {
      set({ data: cached, fetchedStepIndex: stepIndex, selectedBranchId: cached.selected_branch_id, error: null, isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const data = await fetchCopilotState({
        event_id: eventId,
        step_index: stepIndex,
        selected_branch_id: selectedBranchId ?? undefined,
        ai_enhance: false,
      });
      set({
        data,
        fetchedStepIndex: stepIndex,
        selectedBranchId: data.selected_branch_id,
        cache: { ...get().cache, [cacheKey]: data },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Unknown copilot error',
      });
    }
  },
}));

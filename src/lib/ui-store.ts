import { create } from "zustand";

type ServiceModal = null | { mode: "create" } | { mode: "edit"; slug: string };
type TopUpModal = null | { mode: "self" } | { mode: "user"; userId: string; name: string };

type NovaUi = {
  revision: number;
  serviceModal: ServiceModal;
  topUp: TopUpModal;
  bump: () => void;
  openCreateService: () => void;
  openEditService: (slug: string) => void;
  closeServiceModal: () => void;
  openSelfTopUp: () => void;
  openUserTopUp: (userId: string, name: string) => void;
  closeTopUp: () => void;
};

export const useNovaUi = create<NovaUi>((set) => ({
  revision: 0,
  serviceModal: null,
  topUp: null,
  bump: () => set((state) => ({ revision: state.revision + 1 })),
  openCreateService: () => set({ serviceModal: { mode: "create" } }),
  openEditService: (slug) => set({ serviceModal: { mode: "edit", slug } }),
  closeServiceModal: () => set({ serviceModal: null }),
  openSelfTopUp: () => set({ topUp: { mode: "self" } }),
  openUserTopUp: (userId, name) => set({ topUp: { mode: "user", userId, name } }),
  closeTopUp: () => set({ topUp: null }),
}));

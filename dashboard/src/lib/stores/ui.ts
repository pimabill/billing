import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  commandOpen: boolean;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setCommandOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  mobileNavOpen: false,

  setMobileNavOpen: (open: boolean) => {
    set({ mobileNavOpen: open });
  },

  setSidebarCollapsed: (collapsed: boolean) => {
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setCommandOpen: (open: boolean) => {
    set({ commandOpen: open });
  },
}));

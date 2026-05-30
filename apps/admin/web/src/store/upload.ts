import { create } from "zustand";

export interface UploadTask {
  id: string;
  file: File;
  filename: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  createdAt: number;
  completedAt?: number;
}

interface UploadStore {
  tasks: UploadTask[];
  isVisible: boolean;
  addTask: (file: File, parentId?: string | null) => string;
  updateProgress: (id: string, progress: number) => void;
  completeTask: (id: string, success: boolean, error?: string) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
  setVisible: (visible: boolean) => void;
}

export const useUploadStore = create<UploadStore>((set) => ({
  tasks: [],
  isVisible: false,

  addTask: (file, parentId) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const task: UploadTask = {
      id,
      file,
      filename: file.name,
      progress: 0,
      status: "pending",
      createdAt: Date.now(),
    };
    set((state) => ({
      tasks: [...state.tasks, task],
      isVisible: true,
    }));
    return id;
  },

  updateProgress: (id, progress) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, progress, status: "uploading" } : t)),
    }));
  },

  completeTask: (id, success, error) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: success ? "success" : "error",
              error,
              progress: success ? 100 : t.progress,
              completedAt: Date.now(),
            }
          : t,
      ),
    }));

    // Auto-remove success tasks after 3 seconds
    if (success) {
      setTimeout(() => {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
        }));
      }, 3000);
    }
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status !== "success"),
    }));
  },

  setVisible: (visible) => {
    set({ isVisible: visible });
  },
}));

export type Repo = {
  name: string;
  clone_url: string;
  private: boolean;
  created_at: string;
};

export type CloneOptions = {
  username: string;
  outDir: string;
  firstCommitAfter: Date | null;
};

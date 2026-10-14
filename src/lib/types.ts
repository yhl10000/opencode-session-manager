import { z } from "zod";

export const projectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
  })
  .readonly();
export const sessionSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    title: z.string(),
    directory: z.string(),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
    messageCount: z.number().int().nonnegative(),
    model: z.string().nullable(),
    provider: z.string().nullable(),
    tokens: z.number().nonnegative().nullable(),
    parentId: z.string().nullable(),
  })
  .readonly();
export const catalogSchema = z
  .object({
    databasePath: z.string(),
    opencodeVersion: z.string(),
    projects: z.array(projectSchema).readonly(),
    sessions: z.array(sessionSchema).readonly(),
  })
  .readonly();
export const detailSchema = z
  .object({
    session: sessionSchema,
    preview: z
      .array(
        z
          .object({
            id: z.string(),
            role: z.string(),
            text: z.string(),
            createdAt: z.number().finite(),
          })
          .readonly(),
      )
      .readonly(),
    previewTruncated: z.boolean(),
  })
  .readonly();

export type Project = z.infer<typeof projectSchema>;
export type SessionSummary = z.infer<typeof sessionSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type SessionDetail = z.infer<typeof detailSchema>;
export type PreviewMessage = SessionDetail["preview"][number];
export type SortOrder = "activity" | "name";
export type LaunchMode = "tab" | "window";
export type Resource<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: string }
  | { readonly status: "ready"; readonly data: T };

export function assertNever(value: never): never {
  throw new TypeError(`Unexpected variant: ${String(value)}`);
}

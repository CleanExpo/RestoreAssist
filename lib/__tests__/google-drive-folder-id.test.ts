import { beforeEach, describe, expect, it, vi } from "vitest";

// RA-8043d: the folder id is spliced into the Drive files.list query, so a
// quote in it could widen the listing beyond the named folder.
const { filesList } = vi.hoisted(() => ({ filesList: vi.fn() }));

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: class {} },
    drive: () => ({ files: { list: filesList } }),
  },
}));

import { listDriveItems } from "../google-drive";

beforeEach(() => {
  filesList.mockReset();
  filesList.mockResolvedValue({ data: { files: [] } });
  process.env.GOOGLE_CLIENT_EMAIL = "test@example.invalid";
  process.env.GOOGLE_PRIVATE_KEY = "test-key";
});

describe("listDriveItems — folder id validation", () => {
  it("[ra-8043d] rejects a folder id that would inject into the Drive query", async () => {
    const error = await listDriveItems(
      "x' in parents or name contains '",
    ).then(
      () => null,
      (err: Error) => err,
    );

    expect(error?.message).toBe("Invalid Google Drive folder id");
    expect(filesList).not.toHaveBeenCalled();
  });

  it("[ra-8043d] still lists a well-formed folder id and the root", async () => {
    await listDriveItems("1AbC_d-EfGh");
    await listDriveItems("root");

    expect(filesList.mock.calls[0][0].q).toBe(
      "trashed=false and '1AbC_d-EfGh' in parents",
    );
    expect(filesList.mock.calls[1][0].q).toBe(
      "trashed=false and 'root' in parents",
    );
  });
});

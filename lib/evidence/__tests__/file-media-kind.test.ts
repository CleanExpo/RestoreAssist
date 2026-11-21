/**
 * RA-8407: the file must be the kind of media its class names, judged on the
 * declared part type and the file's own leading bytes.
 */
import { describe, expect, it } from "vitest";
import { EvidenceClass } from "@prisma/client";
import { evidenceClassAllowedOnPath } from "../submission-path-classes";
import {
  AUDIO_EVIDENCE_ACCEPT,
  capturesWithStillCamera,
  checkEvidenceFileMedia,
  fileMediaKindForEvidenceClass,
  namedFileMediaClasses,
} from "../file-media-kind";

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(
    values.flatMap((v) =>
      typeof v === "string" ? Array.from(v, (c) => c.charCodeAt(0)) : [v],
    ),
  );

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const PNG = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a);
const MP4 = bytes(0, 0, 0, 0x18, "ftypisom");
const MOV = bytes(0, 0, 0, 0x18, "ftypqt  ");
const HEIC = bytes(0, 0, 0, 0x18, "ftypheic");
const M4A = bytes(0, 0, 0, 0x18, "ftypM4A ");
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f);
const OGG = bytes("OggS", 0, 2);
const WAV = bytes("RIFF", 0, 0, 0, 0, "WAVE");
const WEBP = bytes("RIFF", 0, 0, 0, 0, "WEBP");
const MP3_ID3 = bytes("ID3", 4, 0);
const MP3_FRAME = bytes(0xff, 0xfb, 0x90, 0x00);
const AAC = bytes(0xff, 0xf1, 0x50, 0x80);
const PDF = bytes("%PDF-1.7");

const check = (evidenceClass: string, data: Uint8Array, declaredType: string) =>
  checkEvidenceFileMedia({ evidenceClass, bytes: data, declaredType });

describe("file media kind (RA-8407)", () => {
  it("names every class the file path takes, and nothing else", () => {
    const fileClasses = Object.values(EvidenceClass).filter((cls) =>
      evidenceClassAllowedOnPath(cls, "file"),
    );
    expect(namedFileMediaClasses().sort()).toEqual([...fileClasses].sort());
  });

  it("gives VOICE_MEMO audio, VIDEO_WALKTHROUGH video and photographs image", () => {
    expect(fileMediaKindForEvidenceClass("VOICE_MEMO")).toBe("audio");
    expect(fileMediaKindForEvidenceClass("VIDEO_WALKTHROUGH")).toBe("video");
    for (const cls of ["PHOTO_DAMAGE", "THERMAL_IMAGE", "AFFECTED_CONTENTS"]) {
      expect(fileMediaKindForEvidenceClass(cls)).toBe("image");
    }
    expect(fileMediaKindForEvidenceClass("LAB_RESULT")).toBe("document");
  });

  describe("voice memo", () => {
    it.each([
      ["WebM", WEBM, "audio/webm;codecs=opus", "audio/webm"],
      ["MP4 audio", MP4, "audio/mp4", "audio/mp4"],
      ["M4A", M4A, "audio/x-m4a", "audio/mp4"],
      ["Ogg", OGG, "audio/ogg", "audio/ogg"],
      ["WAV", WAV, "audio/wav", "audio/wav"],
      ["MP3 (ID3)", MP3_ID3, "audio/mpeg", "audio/mpeg"],
      ["MP3 (frame)", MP3_FRAME, "audio/mpeg", "audio/mpeg"],
      ["AAC", AAC, "audio/aac", "audio/aac"],
    ])("accepts %s and records the type the bytes proved", (_n, data, declared, stored) => {
      expect(check("VOICE_MEMO", data, declared)).toEqual({ ok: true, mimeType: stored });
    });

    it("accepts an untyped audio-only file", () => {
      expect(check("VOICE_MEMO", WAV, "")).toEqual({ ok: true, mimeType: "audio/wav" });
      expect(check("VOICE_MEMO", M4A, "application/octet-stream").ok).toBe(true);
    });

    it.each([
      ["JPEG bytes declared image", JPEG, "image/jpeg"],
      ["JPEG bytes declared audio", JPEG, "audio/mp4"],
      ["PNG bytes untyped", PNG, ""],
      ["WebM declared video", WEBM, "video/webm"],
      ["MP4 declared video", MP4, "video/mp4"],
      ["untyped WebM (could be video)", WEBM, ""],
      ["a PDF", PDF, "audio/mpeg"],
      ["a HEIC still", HEIC, "audio/mp4"],
    ])("refuses %s", (_n, data, declared) => {
      const result = check("VOICE_MEMO", data, declared);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/voice memo/);
    });
  });

  describe("video walkthrough", () => {
    it("keeps a declared video type and fills one in from the container", () => {
      expect(check("VIDEO_WALKTHROUGH", MP4, "video/mp4")).toEqual({ ok: true, mimeType: "video/mp4" });
      expect(check("VIDEO_WALKTHROUGH", MOV, "")).toEqual({ ok: true, mimeType: "video/quicktime" });
      expect(check("VIDEO_WALKTHROUGH", WEBM, "application/octet-stream")).toEqual({ ok: true, mimeType: "video/webm" });
    });

    it.each([
      ["MP4 declared image", MP4, "image/jpeg"],
      ["WebM declared audio", WEBM, "audio/webm"],
      ["an M4A", M4A, "video/mp4"],
      ["a HEIC still", HEIC, "video/mp4"],
      ["a JPEG", JPEG, "video/mp4"],
      ["an Ogg", OGG, "video/ogg"],
    ])("refuses %s", (_n, data, declared) => {
      expect(check("VIDEO_WALKTHROUGH", data, declared).ok).toBe(false);
    });
  });

  describe("photographs", () => {
    it("records the image type the bytes proved, typed or untyped", () => {
      expect(check("PHOTO_DAMAGE", JPEG, "image/png")).toEqual({ ok: true, mimeType: "image/jpeg" });
      expect(check("PHOTO_DAMAGE", PNG, "")).toEqual({ ok: true, mimeType: "image/png" });
      expect(check("PHOTO_DAMAGE", WEBP, "application/octet-stream")).toEqual({ ok: true, mimeType: "image/webp" });
    });

    it.each([
      ["JPEG declared audio", JPEG, "audio/webm"],
      ["JPEG declared video", JPEG, "video/mp4"],
      ["JPEG declared PDF", JPEG, "application/pdf"],
      ["WAV declared image", WAV, "image/jpeg"],
      ["MP4 declared image", MP4, "image/jpeg"],
    ])("refuses %s", (_n, data, declared) => {
      expect(check("PHOTO_DAMAGE", data, declared).ok).toBe(false);
    });
  });

  describe("documents keep today's rule", () => {
    it("accepts image bytes whatever the part declares", () => {
      expect(check("FLOOR_PLAN", JPEG, "application/pdf")).toEqual({ ok: true, mimeType: "image/jpeg" });
      expect(check("COMPLIANCE_CERTIFICATE", PNG, "audio/webm")).toEqual({ ok: true, mimeType: "image/png" });
    });

    it("refuses anything else with today's wording", () => {
      expect(check("LAB_RESULT", PDF, "application/pdf")).toEqual({
        ok: false,
        message: "Invalid file type. Only images are allowed.",
      });
    });
  });

  describe("capture screen", () => {
    it("never opens the stills camera for a voice memo or a video", () => {
      expect(capturesWithStillCamera("VOICE_MEMO")).toBe(false);
      expect(capturesWithStillCamera("VIDEO_WALKTHROUGH")).toBe(false);
      expect(capturesWithStillCamera("PHOTO_DAMAGE")).toBe(true);
      expect(capturesWithStillCamera("FLOOR_PLAN")).toBe(true);
    });

    it("offers an audio-only picker for a voice memo", () => {
      for (const type of AUDIO_EVIDENCE_ACCEPT.split(",")) {
        expect(type.startsWith("audio/")).toBe(true);
      }
    });
  });
});

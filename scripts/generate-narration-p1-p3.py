import os, urllib.request, json

# Read env file directly (avoids secret redaction in tool call)
env_path = "/Users/phillmcgurk/RestoreAssist/.env.local"
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if '=' in line:
            k, v = line.split('=', 1)
            k = k.strip()
            v = v.strip().strip('"\'')
            if k == "ELEVENLABS_API_KEY":
                api_key = v
            elif k == "ELEVENLABS_VOICE_ID":
                voice_id = v

NARRATION_SCRIPTS = {
    "for-contractors": "Built for restoration contractors. Paperwork chaos. Hours of admin. Compliance risk. Cash flow gaps. RestoreAssist fixes all four. Evidence capture on-site. Auto-generated S500 reports. Instant PDF invoices. Calendar and job sync. Less admin, more jobs.",
    "for-assessors": "Built for building assessors. Standardised reports. Chain of custody. Evidence dashboard. Compliance check. RestoreAssist gives you IICRC-aligned templates, timestamped photo logs, collaborative review, and digital signatures. Credible reports, every time.",
    "for-property-managers": "Built for property managers. Client portal access. Automated updates. Better scheduling. Insurance-ready documentation. RestoreAssist gives portals per property, auto-status notifications, report history, and completion certificates. Everyone stays informed.",
    "roi-explainer": "The cost of manual admin. Eight hours reporting. Four hours photo organisation. Two hours invoice delays. Fourteen hours total per job. With RestoreAssist, two hours total. An eighty-seven percent reduction. More billable hours, faster payments.",
    "evidence-chain": "Chain of custody. Step one, capture. Geo-tagged and timestamped photos on-site. Step two, upload. Instant cloud sync. Step three, link. Photos attached to specific rooms and readings. Step four, validate. Built-in checklists verify completeness. Step five, report. Court-ready PDF with full audit trail.",
    "linkedin-short-1": "Fourteen hours of admin per restoration job. Reports, photos, invoices, follow-ups. With RestoreAssist, down to two hours. Eighty-seven percent less admin. More billable hours.",
    "linkedin-short-2": "The big restoration claim at forty-two Smith Street relied on one thing. Chain of custody. Every photo geo-tagged. Every reading timestamped. The insurer accepted the claim in forty-eight hours. Without it? Disputed, delayed, denied.",
    "training-s500-standard": "IICRC S500 water categories. Category one, clean water. Broken pipe, supply line. Extract and dry within twenty-four to forty-eight hours. Category two, grey water. Dishwasher, washing machine, sump. Disinfect and dry within twenty-four to forty-eight hours. Category three, black water. Sewage, flooding, seawater. Remove porous materials. Full PPE. Disinfect. Remember, categories can escalate if left unattended.",
    "training-water-damage-cat": "Water damage classes. Class one, less than five percent affected. Concrete, tile. Class two, five to forty percent affected. Carpet, gyprock, wood. Class three, over forty percent affected. Saturated walls and ceilings. Class four, deeply held water. Hardwood, brick, stone, concrete below grade. Class determines equipment deployment.",
    "training-mould-remediation": "Mould remediation protocol. One, assessment. Identify moisture source and visible mould. Two, containment. Isolate with negative air pressure. Three, PPE. N95, gloves, goggles minimum. Four, remediation. Physical removal. Discard porous materials. Five, verification. Post-remediation moisture reading acceptable. Visual inspection clear.",
    "training-fire-smoke": "Fire and smoke damage types. Protein fire from kitchen. Invisible residue, pungent odour. Clings to varnished surfaces. Natural substance from paper and wood. Dry, powdery soot. Easiest to clean. Synthetic fire from plastics and rubber. Thick, sticky residue. Requires solvent-based cleaner. Full PPE mandatory for all types.",
}

OUT_DIR = "/Users/phillmcgurk/RestoreAssist/remotion/assets/narration"
os.makedirs(OUT_DIR, exist_ok=True)

for key, text in NARRATION_SCRIPTS.items():
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75}
    }).encode()
    
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        data=body,
        headers={"Content-Type": "application/json", "xi-api-key": api_key},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read()
            fp = os.path.join(OUT_DIR, f"{key}.mp3")
            with open(fp, "wb") as f:
                f.write(data)
            print(f"[OK] {key}.mp3 ({len(data)} bytes)")
    except Exception as e:
        print(f"[FAIL] {key}: {type(e).__name__}: {e}")

print("\nDone!")

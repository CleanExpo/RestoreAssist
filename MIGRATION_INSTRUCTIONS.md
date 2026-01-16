# Migration Instructions - Authority Forms Feature

## ⚠️ Important: Run These Commands

The authority forms feature requires database schema updates. You need to run these commands to sync the Prisma Client and database:

### Step 1: Regenerate Prisma Client

```bash
npx prisma generate
```

This will update the Prisma Client to include the new `assignedManagerId` and `assignedAdminId` fields (and the new authority forms models).

### Step 2: Create and Apply Migration

```bash
npx prisma migrate dev --name add_authority_forms
```

This will:
- Create a migration file for the new authority forms models
- Apply the migration to your database
- Update the Prisma Client

### Step 3: Seed Form Templates (Optional but Recommended)

```bash
npx tsx prisma/seed-authority-forms.ts
```

This will create the default authority form templates:
- Authority to Commence Work
- Authority to Dispose
- Authority to Not Remove Recommended Damaged Building Materials
- Authority for Chemical Treatment
- Authority for Extended Drying Period

---

## What Changed

### New Database Models
- `AuthorityFormTemplate` - Form templates
- `AuthorityFormInstance` - Form instances for reports
- `AuthorityFormSignature` - Signatures on forms

### New Fields on Report Model
- `assignedManagerId` - For Technicians to assign reports to Managers
- `assignedAdminId` - For Managers to assign reports to Admins

### New Enums
- `AuthorityFormStatus` - DRAFT, PENDING_SIGNATURES, PARTIALLY_SIGNED, COMPLETED, CANCELLED
- `AuthoritySignatoryRole` - CLIENT, INSURER, CONTRACTOR, ADMIN, TECHNICIAN, MANAGER, PROPERTY_OWNER

---

## Troubleshooting

If you get errors about unknown fields:
1. Make sure you've run `npx prisma generate`
2. Restart your dev server after running `prisma generate`
3. Make sure the migration has been applied: `npx prisma migrate status`

If you get database connection errors:
- Check your `DATABASE_URL` in `.env`
- Make sure your database is running and accessible

---

## After Migration

Once the migration is complete:
1. Restart your Next.js dev server
2. Navigate to any report detail page
3. Click the "Authority Forms" tab
4. The feature should work with auto-suggestions based on report data

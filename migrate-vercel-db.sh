#!/bin/bash

# Script to run database migration on Vercel
# This adds the missing subscription fields to the User table

echo "🚀 Running database migration for subscription fields..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo "Please set your Vercel database URL:"
    echo "export DATABASE_URL='your_vercel_database_url_here'"
    exit 1
fi

# Run the migration SQL
echo "📝 Executing migration SQL..."
psql "$DATABASE_URL" -f prisma/migrations/add_subscription_fields.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
    echo "🎉 Your Vercel database now has subscription fields"
else
    echo "❌ Migration failed. Please check your database connection and try again."
    exit 1
fi

echo ""
echo "📋 Next steps:"
echo "1. Deploy your application to Vercel"
echo "2. Test the signup functionality"
echo "3. Verify subscription features work correctly"

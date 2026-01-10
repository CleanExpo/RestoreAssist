#!/bin/bash

echo "Testing alternative Supabase projects..."
echo ""

# Project 1: ithmbupvmriruprrdiob (from .env.vercel)
echo "1. Testing ithmbupvmriruprrdiob..."
TESTDB1="postgresql://postgres:KafwyuOTLegPb9uH@db.ithmbupvmriruprrdiob.supabase.co:5432/postgres"
timeout 5 psql "$TESTDB1" -c "SELECT 1 as test;" 2>&1 | head -5

echo ""
echo "2. Testing stielawqvxnzd7c..."
echo "   (Credentials unknown, skipping)"

echo ""
echo "If project 1 works, switch Vercel to use ithmbupvmriruprrdiob"

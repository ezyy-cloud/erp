#!/bin/bash
# Script to run database migration via Supabase Dashboard
# 
# Option 1: Use Supabase Dashboard (Recommended)
# 1. Go to https://supabase.com/dashboard/project/zfvywfujvguzvlmlxfae
# 2. Navigate to SQL Editor
# 3. Click "New Query"
# 4. Copy and paste the contents of supabase/migrations/001_initial_schema.sql
# 5. Click "Run" to execute

echo "=========================================="
echo "Migration Instructions"
echo "=========================================="
echo ""
echo "To run the migration, you have two options:"
echo ""
echo "OPTION 1: Supabase Dashboard (Recommended)"
echo "1. Go to: https://supabase.com/dashboard/project/zfvywfujvguzvlmlxfae/sql"
echo "2. Click 'New Query'"
echo "3. Copy the contents of: supabase/migrations/001_initial_schema.sql"
echo "4. Paste into the SQL Editor"
echo "5. Click 'Run'"
echo ""
echo "OPTION 2: Using psql (if you have database password)"
echo "You'll need your database password from Supabase Dashboard > Settings > Database"
echo ""
echo "Migration file location:"
echo "$(pwd)/supabase/migrations/001_initial_schema.sql"
echo ""
echo "=========================================="

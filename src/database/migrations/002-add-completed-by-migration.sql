-- Migration: Add completedBy column to service_requests
-- Description: Adds completedBy field to track whether request was completed by waiter or customer
-- Date: 2025-12-23

-- Add completedBy column to service_requests table
ALTER TABLE service_requests 
ADD COLUMN IF NOT EXISTS completed_by VARCHAR(50);

-- Add comment to column
COMMENT ON COLUMN service_requests.completed_by IS 'Who completed the request: waiter or customer';

-- Update existing completed requests to default to waiter
UPDATE service_requests 
SET completed_by = 'waiter' 
WHERE status = 'completed' AND completed_by IS NULL;


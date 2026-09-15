-- Delete the duplicate M31 record (the one with NULL last_ping_at)
DELETE FROM android_devices 
WHERE id = 'bee25669-f19f-4483-9620-36229250feb0';
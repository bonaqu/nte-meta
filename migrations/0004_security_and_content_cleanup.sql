UPDATE guides
SET video_url = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

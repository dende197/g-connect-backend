-- 1. FIX TABELLA PROFILES
-- Se hai una colonna 'userId', rinominala in 'id'
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'userId') THEN
        ALTER TABLE profiles RENAME COLUMN "userId" TO id;
    END IF;
END $$;

-- Assicurati che la colonna id sia la Primary Key
-- (Nota: se hai già una PK chiamata id, questo potrebbe dare errore, ma è per sicurezza)
-- ALTER TABLE profiles ADD PRIMARY KEY (id);

-- Assicurati che la colonna avatar esista
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar TEXT;

-- 2. DISABILITA RLS (O configura policies)
-- Disabilitare RLS sulla tabella profiles permette al backend (service_role) di scrivere liberamente
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- 3. STORAGE CONFIGURATION
-- Assicurati che il bucket avatars esista (puoi farlo da UI o SQL se hai estensioni)
-- Qui configuriamo le policies per il bucket 'avatars'

-- Permetti SELECT pubblica
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Permetti INSERT/UPDATE/DELETE al service_role (backend)
CREATE POLICY "Service Role Full Access"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');

-- Nota: Se l'upload fallisce ancora con 403, disabilita RLS sul bucket da Supabase Dashboard:
-- Storage -> avatars -> Edit Bucket -> Disable RLS

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
});

async function clean() {
    console.log("🧹 Inizio pulizia profili placeholder...");

    // Cerca profili che iniziano con "STUDENTE" (case insensitive)
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('name', 'STUDENTE%');

    if (error) {
        console.error("❌ Errore fetch profiles:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("✅ Nessun profilo placeholder trovato.");
        return;
    }

    console.log(`⚠️ Trovati ${data.length} profili sospetti:`, data.map(p => `${p.name} (${p.id})`));

    // Delete
    const { error: delError } = await supabase
        .from('profiles')
        .delete()
        .ilike('name', 'STUDENTE%');

    if (delError) {
        console.error("❌ Errore cancellazione:", delError);
    } else {
        console.log("✅ Cancellazione completata.");
    }
}

clean();

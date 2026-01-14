const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const messageRoutes = require('./routes/messages.routes');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Integratione Registro Planner (Stub)
// Questo endpoint in futuro si collegherà a DidUP/Argo API
app.get('/api/planner', (req, res) => {
    res.json({
        message: "Planner integration placeholder",
        note: "Official APIs needed or HTML scraping implementation required."
    });
});

// Health Check
app.get('/', (req, res) => {
    res.send('G-Connect API is running securely.');
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;

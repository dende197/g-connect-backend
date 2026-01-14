const express = require('express');
const prisma = require('../prisma');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Get conversation with a specific user
router.get('/:userId', authMiddleware, async (req, res) => {
    const otherUserId = req.params.userId;
    const currentUserId = req.user.id;

    try {
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: otherUserId },
                    { senderId: otherUserId, receiverId: currentUserId }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching messages' });
    }
});

// Send a message
router.post('/', authMiddleware, async (req, res) => {
    const { receiverId, content, imageUrl } = req.body;
    const senderId = req.user.id;

    try {
        const message = await prisma.message.create({
            data: {
                senderId,
                receiverId,
                content,
                imageUrl
            }
        });

        res.status(201).json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error sending message' });
    }
});

module.exports = router;

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve your built website
app.use(express.static(path.join(__dirname, 'dist')));

// If user opens any route → send index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
const greenlock = require('greenlock-express');
require('dotenv').config();

// Validate environment variables
if (!process.env.DOMAIN || !process.env.EMAIL) {
    console.error('Error: DOMAIN and EMAIL environment variables are required for SSL setup');
    process.exit(1);
}

greenlock.init({
    packageRoot: __dirname,
    configDir: './greenlock.d',
    maintainerEmail: process.env.EMAIL,
    cluster: false
}).ready(glx => {
    glx.serveApp(app => {
        // Define challenge handling
        app.use('/', (req, res) => {
            res.send('SSL setup complete!');
        });
    });

    const sites = [{
        subject: process.env.DOMAIN,
        altnames: [process.env.DOMAIN]
    }];

    // Install certificates
    sites.forEach(site => {
        glx.add(site).catch(err => {
            console.error('Error adding site:', err.message);
        });
    });
}); 
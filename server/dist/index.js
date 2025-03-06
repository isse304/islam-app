"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ai_1 = __importDefault(require("./routes/ai"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Mount routes
app.use('/api/ai', ai_1.default);
app.get('/', (req, res) => {
    res.json({ message: 'IslamApp API is running' });
});
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

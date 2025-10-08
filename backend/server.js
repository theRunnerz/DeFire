import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🔥 DeFire Backend is running!");
});

app.get("/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;
    const response = await axios.get(`https://apilist.tronscanapi.com/api/account?address=${address}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch wallet data" });
  }
});

app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));

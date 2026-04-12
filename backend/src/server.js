
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const app = require("./app");
const { clearTempFolder } = require("./utils/githubZipHandler");

const PORT = process.env.PORT || 5000;

async function start() {
    await clearTempFolder(); // 🔥 THIS is what you wanted

    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
    });
}

start();

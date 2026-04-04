# 🕸️ Shinkei (神経)

**Shinkei** (Japanese for "nerve") is a high-fidelity code navigation and call-graph visualization engine. It allows developers to explore complex codebases by mapping function relationships, API routes, and event flows through an interactive, interactive graph.

Unlike simple text-based search, Shinkei uses the **TypeScript Compiler API** to perform deep static analysis, providing a "living map" of how your project’s pieces connect across files.

---

## ✨ Key Features

-   **Deep Static Analysis**: Powered by the TypeScript Compiler API for industry-grade parsing of JS and TS, handling cross-file imports and type-aware resolution.
-   **Interactive Call Graphs**: A custom SVG-based visualization engine that renders function call chains, API endpoints, and event emitters.
-   **Forward & Backward Tracing**: Explore dependencies by following where a function is called (*Backward*) or what functions it calls (*Forward*).
-   **GitHub Integration**: Directly analyze any public repository by pasting its URL.
-   **Integrated Code Inspection**: Click any node to instantly view its source code with syntax highlighting in a dedicated side panel.
-   **Rich Aesthetics**: Built with a modern, "glassmorphism" UI featuring smooth animations (Framer Motion) and shader-based visual effects.

---

## 🛠️ Tech Stack

### Frontend
-   **React 19**: Utilizing the latest React features for a responsive UI.
-   **Vite 8**: Ultra-fast build tool and development server.
-   **Tailwind CSS 4**: Modern styling with the latest Tailwind features.
-   **Framer Motion**: Fluid animations for graph transitions and UI elements.
-   **Lucide React**: Clean, consistent iconography.
-   **Custom SVG Engine**: A bespoke layout and rendering system for graph nodes and edges.

### Backend
-   **Node.js & Express 5**: Robust API foundation.
-   **TypeScript Compiler API**: The "brain" that parses code and understands relationships.
-   **OpenTelemetry**: Integrated for advanced tracing and telemetry (Experimental).
-   **Adm-Zip & Axios**: Efficient fetching and processing of remote repository archives.

---

## 🚀 Getting Started

### Prerequisites
-   **Node.js 18+**
-   **pnpm** or **npm**

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/shinkei.git
    cd shinkei
    ```

2.  **Setup Backend:**
    ```bash
    cd backend
    npm install
    npm run dev
    ```
    The backend will start on [http://localhost:5000](http://localhost:5000).

3.  **Setup Frontend:**
    ```bash
    cd ../frontend
    npm install
    npm run dev
    ```
    The frontend will be available at [http://localhost:5173](http://localhost:5173).

---

## 📖 Usage

1.  **Enter Repository**: Paste a GitHub repository URL into the input field on the home screen.
2.  **Define Entry Point**: Specify the name of a function you want to start analyzing from.
3.  **Set Depth**: Choose how many levels deep you want the graph to explore (1-100).
4.  **Explore**:
    -   **Click Nodes**: Inspect the code for that specific function.
    -   **Toggle Direction**: Switch between "Forward" (calls made) and "Backward" (callers) analysis.
    -   **Navigate**: Use the interactive graph to follow the logic flow of the application.

---

## 🏗️ Architecture

-   **Parser Engine**: Located in `backend/src/parser/engine`, it initializes a TypeScript `Program` for the entire project, allowing for holistic analysis rather than isolated file parsing.
-   **Extractors**: Specialized modules (`functions`, `calls`, `routes`, `events`) that traverse the AST to identify specific code patterns.
-   **Graph Layout**: A custom coordinate-based layout system (`frontend/src/utils/graphLayout.js`) that calculates optimal positioning for hierarchical nodes.

---

## 📄 License

This project is licensed under the ISC License. See the `LICENSE` file for details (if applicable).

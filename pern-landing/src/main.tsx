import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// No StrictMode: this page mounts several WebGL canvases, and StrictMode's
// double-invocation creates/destroys the GL context twice in dev, which adds
// to the "3D appears after a while" startup delay and risks context loss.
createRoot(document.getElementById("root")!).render(<App />);

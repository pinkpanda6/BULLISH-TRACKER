import "./styles/globals.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { applyTheme, readDarkPreference } from "./utils/theme";

applyTheme(readDarkPreference());

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
    <React.Fragment>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <App />
        </BrowserRouter>
    </React.Fragment>
);

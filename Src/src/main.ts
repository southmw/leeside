// Entry point. Step 0.1 only proves the toolchain works; the renderer arrives in step 0.3.
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app element");
}

app.textContent = "LEESIDE";

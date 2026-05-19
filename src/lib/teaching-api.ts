export const API_BASE_URL = "http://127.0.0.1:8000";

async function predict(endpoint: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/analyze/${endpoint}`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Failed to predict ${endpoint}`);
    }

    return response.json();
}

export const teachingApi = {
    predictBrainMRI: (file: File) => predict("brain-mri", file),
    predictChestXray: (file: File) => predict("chest-xray", file),
    predictBoneFracture: (file: File) => predict("bone-fracture", file),
    predictDental: (file: File) => predict("dental", file),
    predictDermatology: (file: File) => predict("skin-cancer", file),
    predictFundus: (file: File) => predict("dr", file),
    predictTB: (file: File) => predict("tb", file),
    predictCataract: (file: File) => predict("cataract", file),
};

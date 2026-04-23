import whisperx

device = "cpu"
model = whisperx.load_model("base", device)

print("WhisperX loaded successfully")
print(type(model))
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Player } from "./player.ts";
import { Recorder } from "./recorder.ts";
import "./style.css";
import { LowLevelRTClient, SessionUpdateMessage } from "rt-client";

let realtimeStreaming: LowLevelRTClient;
let audioRecorder: Recorder;
let audioPlayer: Player;

async function start_realtime(endpoint: string, apiKey: string, deploymentOrModel: string) {
  if (isAzureOpenAI()) {
    realtimeStreaming = new LowLevelRTClient(new URL(endpoint), { key: apiKey }, { deployment: deploymentOrModel });
  } else {
    realtimeStreaming = new LowLevelRTClient({ key: apiKey }, { model: deploymentOrModel });
  }

  try {
    console.log("sending session config");
    await realtimeStreaming.send(createConfigMessage());
  } catch (error) {
    console.log(error);
    makeNewTextBlock("[Connection error]: Unable to send initial config message. Please check your endpoint and authentication details.");
    setFormInputState(InputState.ReadyToStart);
    return;
  }
  console.log("sent");
  await Promise.all([resetAudio(true), handleRealtimeMessages()]);
}

// This is the function that we want the model to be able to call
function switchLights(turnOn: boolean) : string {
  if (turnOn) {
    lightBulb.classList.remove("hidden");
  }
  else {
    lightBulb.classList.add("hidden");
  }

  return "Light state changed."  
}

// This is the function that we want the model to be able to call
function setLightColor(rgb: string) : string {
  lightBulb.style.color = rgb;
  return "Light color changed."
}

async function closeProcess(id: number) : Promise<string> {  
  const response = await fetch('http://localhost:5099/windowssettings/TerminateProcess/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(id)
  });

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

async function startApp(name: string) : Promise<string> {
  
  const response = await fetch('http://localhost:5099/windowssettings/LaunchApp/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(name)
  });

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

async function setWindowsTheme(theme: string) : Promise<string> {
  
  const response = await fetch('http://localhost:5099/windowssettings/settheme/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(theme)
  });

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

async function setWindowsAccentColor(color: string) : Promise<string> {
  
  const response = await fetch('http://localhost:5099/windowssettings/setaccentcolor/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(color)
  });

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

async function setTaskbarVisibility(show: boolean) : Promise<string> {
  
  const response = await fetch('http://localhost:5099/windowssettings/settaskbarvisibility/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(show)
  });

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

async function getProcessInfo() : Promise<string> {
  
  const response = await fetch('http://localhost:5099/windowssettings/GetProcessInfo/');

  if (response.ok)
  {
    return await response.text();
  }
  else
  {
    return "http request failed with " + response.status;
  }
}

function createConfigMessage() : SessionUpdateMessage {

  let configMessage : SessionUpdateMessage = {
    type: "session.update",
    session: {
      turn_detection: {
        type: "server_vad",
      },
      input_audio_transcription: {
        model: "whisper-1"
      },
      tools: [
        {
            type: "function",
            name: "switchLights",
            description: "Switch lights function. Call this whenever the user asks for turning the lights on or off.",
            parameters: {
                type: "object",
                properties: {
                    turnOn: {
                        type: "boolean",
                        description: "Value indicating whether the lights should be turned on or off. Pass true for turning on the lights, or false for turning it off.",
                    },
                },
                required: ["turnOn"],
                additionalProperties: false,
            }
        },
        {
          type: "function",
          name: "setLightColor",
          description: "Function to set the color of the lights. Call this whenever the user asks for setting the lights color to a color.",
          parameters: {
              type: "object",
              properties: {
                  rgb: {
                      type: "string",
                      description: "Value indicating the light color to set to. Don't use color names or descriptions, but rather a valid css rgb expression like rgb(255,0,0) if the user asks for a strong red color.",
                  },
              },
              required: ["rgb"],
              additionalProperties: false,
          },
        },
        {
          type: "function",
          name: "setWindowsTheme",
          description: "Function to set the theme in Windows. Call this whenever the user asks for a windows computer theme change.",
          parameters: {
              type: "object",
              properties: {
                theme: {
                    type: "string",
                    description: "Value indicating the theme to set to. Use only values Light or Dark based on the user's request.",
                },
            },
            required: ["theme"],
              additionalProperties: false,
          },
        },       
        {
          type: "function",
          name: "setWindowsAccentColor",
          description: "Function to set the accent color in Windows. Call this whenever the user asks to change the accent color in their machine.",
          parameters: {
              type: "object",
              properties: {
                  rgb: {
                      type: "string",
                      description: "Value indicating the accent color to set to. Don't use color names or descriptions, but rather a valid css rgb expression like rgb(255,0,0) if the user asks for a strong red color.",
                  },
              },
              required: ["rgb"],
              additionalProperties: false,
          },
        }, 
        {
          type: "function",
          name: "terminateProcess",
          description: `Function to terminate a process in Windows. Call this whenever the user asks to 
          close an app. The id passed as parameter should be the process id from the list of processes. Make sure to 
          ask for user confirmation before calling this function since it is not reversible.`,
          parameters: {
              type: "object",
              properties: {
                  id: {
                      type: "number",
                      description: "Value indicating the process id.",
                  },
              },
              required: ["id"],
              additionalProperties: false,
          },
        },                 
        {
          type: "function",
          name: "launchApp",
          description: `Function to launch an app in Windows. Call this whenever the user asks to 
          start an app. The name passed as parameter should be the executable name for the most likely app 
          the user wants (e.g. notepad, calc, mspaint, etc), or the app URI scheme for the app (e.g. microsoft.windows.camera:). 
          If you aren't sure of the executable name, or if the request fails, you can try asking the user for the name to see if that helps. 
          `,
          parameters: {
              type: "object",
              properties: {
                  name: {
                      type: "string",
                      description: "Value indicating the app name.",
                  },
              },
              required: ["name"],
              additionalProperties: false,
          },
        },           
        {
          type: "function",
          name: "setTaskbarVisibility",
          description: "Function to set the visibility of the Taskbar in Windows. Call this whenever the user asks to change the taskbar visibility in their machine.",
          parameters: {
              type: "object",
              properties: {
                  show: {
                      type: "boolean",
                      description: "Value indicating whether the taskbar should be visible or not. Use true if the taskbar should be visible, or false to make it auto hide.",
                  },
              },
              required: ["show"],
              additionalProperties: false,
          },
        },
        {
            type: "function",
            name: "getProcessInfo",
            description: `Function to get the information about the top processes in terms of memory consumption in the machine. 
                          Call this whenever the user asks about what might be using the most memory on their machine.
                          When talking about the processes back to the user reference application names instead of process names if you 
                          think you know the public names of those apps. Be brief and don't repeat all the process list information. Focus on 
                          what you think is most relevant to the problem.`,
            parameters: {
                type: "object",
                properties: {
                },
                required: [],
                additionalProperties: false,
            },          
        },           
    ]
    }
  };

  const systemMessage = getSystemMessage();
  const temperature = getTemperature();
  const voice = getVoice();

  if (systemMessage) {
    configMessage.session.instructions = systemMessage;
  }
  if (!isNaN(temperature)) {
    configMessage.session.temperature = temperature;
  }
  if (voice) {
    configMessage.session.voice = voice;
  }

  return configMessage;
}

async function handleRealtimeMessages() {
  for await (const message of realtimeStreaming.messages()) {
    let consoleLog = "" + message.type;

    switch (message.type) {
      case "session.created":
        formReceivedTextContainer.replaceChildren();
        setFormInputState(InputState.ReadyToStop);
        makeNewTextBlock("<< Session Started >>");
        makeNewTextBlock();

        // realtimeStreaming.send({
        //   type: "response.create",
        // });  

        break;
      case "response.audio_transcript.delta":
        appendToTextBlock(message.delta);
        break;
      case "response.audio.delta":
        const binary = atob(message.delta);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const pcmData = new Int16Array(bytes.buffer);
        audioPlayer.play(pcmData);
        break;

      case "input_audio_buffer.speech_started":
        makeNewTextBlock("<< Speech Started >>");
        let textElements = formReceivedTextContainer.children;
        latestInputSpeechBlock = textElements[textElements.length - 1];
        makeNewTextBlock();
        audioPlayer.clear();
        break;
      case "conversation.item.input_audio_transcription.completed":
        latestInputSpeechBlock.textContent += " User: " + message.transcript;
        break;
      case "response.done":
        formReceivedTextContainer.appendChild(document.createElement("hr"));
        break;
      case "response.function_call_arguments.done":
        makeNewTextBlock(`<< Function Call Request >>`);
        makeNewTextBlock(`Calling ${message.name} with arguments ${message.arguments} ...`);
        let result = "";
        switch (message.name) {
          case "switchLights":
            result = switchLights(JSON.parse(message.arguments)["turnOn"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });          
  
            realtimeStreaming.send({
              type: "response.create",
            });                
            break;
          case "setLightColor":
            result = setLightColor(JSON.parse(message.arguments)["rgb"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });          
  
            realtimeStreaming.send({
              type: "response.create",
            });  
            break;
          case "launchApp":
            result = await startApp(JSON.parse(message.arguments)["name"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });          
  
            realtimeStreaming.send({
              type: "response.create",
            });  
            break;              
          case "terminateProcess":
            result = await closeProcess(JSON.parse(message.arguments)["id"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });          
  
            realtimeStreaming.send({
              type: "response.create",
            });  
            break;                     
          case "setWindowsTheme":
            result = await setWindowsTheme(JSON.parse(message.arguments)["theme"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });             
  
            realtimeStreaming.send({
              type: "response.create",
            });  
            break;    
          case "setWindowsAccentColor":
            result = await setWindowsAccentColor(JSON.parse(message.arguments)["rgb"]);
            realtimeStreaming.send({
              type: "conversation.item.create",
              item: {type: "function_call_output", call_id: message.call_id,  output: result },
            });          
  
            realtimeStreaming.send({
              type: "response.create",
            });  
            break;         
            case "setTaskbarVisibility":
              result = await setTaskbarVisibility(JSON.parse(message.arguments)["show"]);
              realtimeStreaming.send({
                type: "conversation.item.create",
                item: {type: "function_call_output", call_id: message.call_id,  output: result },
              });          
    
              realtimeStreaming.send({
                type: "response.create",
              });  
              break;  
            case "getProcessInfo":
                let data = await getProcessInfo();
                realtimeStreaming.send({
                  type: "conversation.item.create",
                  item: {type: "function_call_output", call_id: message.call_id,  output: data },
                });          
      
                realtimeStreaming.send({
                  type: "response.create",
                });  
                break;                  
          default:
            break;
        }
        break;
      default:
        consoleLog = JSON.stringify(message, null, 2);
        // makeNewTextBlock(`<< Message loop default block: >>`);
        // makeNewTextBlock(consoleLog);
        break
    }
    if (consoleLog) {
      console.log(consoleLog);
    }
  }
  resetAudio(false);
}

/**
 * Basic audio handling
 */

let recordingActive: boolean = false;
let buffer: Uint8Array = new Uint8Array();

function combineArray(newData: Uint8Array) {
  const newBuffer = new Uint8Array(buffer.length + newData.length);
  newBuffer.set(buffer);
  newBuffer.set(newData, buffer.length);
  buffer = newBuffer;
}

function processAudioRecordingBuffer(data: Buffer) {
  const uint8Array = new Uint8Array(data);
  combineArray(uint8Array);
  if (buffer.length >= 4800) {
    const toSend = new Uint8Array(buffer.slice(0, 4800));
    buffer = new Uint8Array(buffer.slice(4800));
    const regularArray = String.fromCharCode(...toSend);
    const base64 = btoa(regularArray);
    if (recordingActive) {
      realtimeStreaming.send({
        type: "input_audio_buffer.append",
        audio: base64,
      });
    }
  }

}

async function resetAudio(startRecording: boolean) {
  recordingActive = false;
  if (audioRecorder) {
    audioRecorder.stop();
  }
  if (audioPlayer) {
    audioPlayer.clear();
  }
  audioRecorder = new Recorder(processAudioRecordingBuffer);
  audioPlayer = new Player();
  audioPlayer.init(24000);
  if (startRecording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioRecorder.start(stream);
    recordingActive = true;
  }
}

/**
 * UI and controls
 */

const formReceivedTextContainer = document.querySelector<HTMLDivElement>(
  "#received-text-container",
)!;
const formStartButton =
  document.querySelector<HTMLButtonElement>("#start-recording")!;
const formStopButton =
  document.querySelector<HTMLButtonElement>("#stop-recording")!;
const formEndpointField =
  document.querySelector<HTMLInputElement>("#endpoint")!;
const formAzureToggle =
  document.querySelector<HTMLInputElement>("#azure-toggle")!;
const formApiKeyField = document.querySelector<HTMLInputElement>("#api-key")!;
const formDeploymentOrModelField = document.querySelector<HTMLInputElement>("#deployment-or-model")!;
const formSessionInstructionsField =
  document.querySelector<HTMLTextAreaElement>("#session-instructions")!;
const formTemperatureField = document.querySelector<HTMLInputElement>("#temperature")!;
const formVoiceSelection = document.querySelector<HTMLInputElement>("#voice")!;
const formSendTextButton =
  document.querySelector<HTMLButtonElement>("#text-input-send-button")!;
const formUserTextInputField =
  document.querySelector<HTMLButtonElement>("#text-input-content-instructions")!;
const lightBulb =
  document.querySelector<HTMLButtonElement>("#lightBulb")!;


let latestInputSpeechBlock: Element;

enum InputState {
  Working,
  ReadyToStart,
  ReadyToStop,
}

function isAzureOpenAI(): boolean {
  return formAzureToggle.checked;
}

function guessIfIsAzureOpenAI() {
  const endpoint = (formEndpointField.value || "").trim();
  formAzureToggle.checked = endpoint.indexOf('azure') > -1;
}

function setFormInputState(state: InputState) {
  formEndpointField.disabled = state != InputState.ReadyToStart;
  formApiKeyField.disabled = state != InputState.ReadyToStart;
  formDeploymentOrModelField.disabled = state != InputState.ReadyToStart;
  formStartButton.disabled = state != InputState.ReadyToStart;
  formStopButton.disabled = state != InputState.ReadyToStop;
  formSessionInstructionsField.disabled = state != InputState.ReadyToStart;
  formAzureToggle.disabled = state != InputState.ReadyToStart;
}

function getSystemMessage(): string {
  return formSessionInstructionsField.value || "";
}

function getUserMessage(): string {
  return formUserTextInputField.value || "";
}

function getTemperature(): number {
  return parseFloat(formTemperatureField.value);
}

function getVoice(): "alloy" | "echo" | "shimmer" {
  return formVoiceSelection.value as "alloy" | "echo" | "shimmer";
}

function makeNewTextBlock(text: string = "") {
  let newElement = document.createElement("p");
  newElement.textContent = text;
  formReceivedTextContainer.appendChild(newElement);
  formReceivedTextContainer.scrollTop = formReceivedTextContainer.scrollHeight;
}

function appendToTextBlock(text: string) {
  let textElements = formReceivedTextContainer.children;
  if (textElements.length == 0) {
    makeNewTextBlock();
  }
  textElements[textElements.length - 1].textContent += text;
  formReceivedTextContainer.scrollTop = formReceivedTextContainer.scrollHeight;  
}

formStartButton.addEventListener("click", async () => {
  setFormInputState(InputState.Working);

  const endpoint = formEndpointField.value.trim();
  const key = formApiKeyField.value.trim();
  const deploymentOrModel = formDeploymentOrModelField.value.trim();

  if (isAzureOpenAI() && !endpoint && !deploymentOrModel) {
    alert("Endpoint and Deployment are required for Azure OpenAI");
    return;
  }

  if (!isAzureOpenAI() && !deploymentOrModel) {
    alert("Model is required for OpenAI");
    return;
  }

  if (!key) {
    alert("API Key is required");
    return;
  }

  try {
    start_realtime(endpoint, key, deploymentOrModel);
  } catch (error) {
    console.log(error);
    setFormInputState(InputState.ReadyToStart);
  }
});

formStopButton.addEventListener("click", async () => {
  setFormInputState(InputState.Working);
  resetAudio(false);
  realtimeStreaming.close();
  setFormInputState(InputState.ReadyToStart);
});

formEndpointField.addEventListener('change', async () => {
  guessIfIsAzureOpenAI();
});
guessIfIsAzureOpenAI();

formSendTextButton.addEventListener("click", async () => {
  if (recordingActive) {
    makeNewTextBlock("<< Sending text content >>");
    // makeNewTextBlock(getUserMessage());
    realtimeStreaming.send({
      type: "conversation.item.create",
      item: {type: "message", role: "user", content: [{ type: "input_text", text: getUserMessage() }] },
    });
  }
});
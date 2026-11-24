import { buttonTool } from "../button-parts.js";
import maleFoot from "./maleFoot.js";
import stud from "./stud.js";
import socket from "./socket.js";
import femaleFoot from "./femaleFoot.js";

export default buttonTool("sewButton", "车缝钮", { maleFoot, stud, socket, femaleFoot }, {
  "domed": [
    29.85,
    21.1,
    12.02,
    0.0
  ],
  "flat": [
    29.08,
    20.33,
    11.25,
    0.0
  ],
  "cut": [
    29.08,
    20.33,
    11.25,
    0.0
  ]
});

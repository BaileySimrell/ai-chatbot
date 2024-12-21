from fastapi import FastAPI, WebSocket
import asyncio
import sys
from io import StringIO
import contextlib
import json
import logging
import traceback

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = FastAPI()

# Global namespace for code execution
GLOBALS = {
    '__name__': '__main__',
    'print': print  # Ensure print is available
}

# Import commonly used packages
try:
    import numpy as np
    import pandas as pd
    import vectorbtpro as vbt
    GLOBALS.update({
        'np': np,
        'pd': pd,
        'vbt': vbt
    })
    logger.info("Successfully imported scientific packages")
except ImportError as e:
    logger.warning(f"Could not import some packages: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    try:
        logger.debug("Client attempting to connect...")
        await websocket.accept()
        logger.info("Client connected successfully")
        
        while True:
            try:
                logger.debug("Waiting for message...")
                data = await websocket.receive_text()
                logger.debug(f"Received raw data: {data}")
                
                try:
                    parsed_data = json.loads(data)
                    logger.debug(f"Parsed data: {parsed_data}")
                    code = parsed_data["code"]
                    logger.debug(f"Code to execute: {code}")
                    
                    stdout = StringIO()
                    with contextlib.redirect_stdout(stdout):
                        try:
                            logger.debug("Compiling code...")
                            compiled_code = compile(code, '<string>', 'exec')
                            
                            logger.debug("Executing code...")
                            exec(compiled_code, GLOBALS)
                            
                            output = stdout.getvalue()
                            logger.debug(f"Code execution successful. Output: {output}")
                            
                            await websocket.send_json({
                                "status": "completed",
                                "content": output or "Code executed successfully"
                            })
                            logger.debug("Response sent to client")
                        except Exception as e:
                            error_msg = f"Error: {str(e)}\n{traceback.format_exc()}"
                            logger.error(f"Code execution error: {error_msg}")
                            await websocket.send_json({
                                "status": "failed",
                                "content": error_msg
                            })
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    await websocket.send_json({
                        "status": "failed",
                        "content": f"Invalid JSON: {str(e)}"
                    })
                    continue
                except KeyError as e:
                    logger.error(f"Missing 'code' key in data: {e}")
                    await websocket.send_json({
                        "status": "failed",
                        "content": "Missing 'code' in request"
                    })
                    continue
                    
            except Exception as e:
                logger.error(f"Error handling message: {str(e)}\n{traceback.format_exc()}")
                await websocket.send_json({
                    "status": "failed",
                    "content": f"Server error: {str(e)}"
                })
                break
                
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}\n{traceback.format_exc()}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000, 
        log_level="debug",
        ws_ping_interval=None,
        ws_ping_timeout=None,
    ) 
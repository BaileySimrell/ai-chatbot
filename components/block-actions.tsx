import { cn, generateUUID } from '@/lib/utils';
import { ClockRewind, CopyIcon, PlayIcon, RedoIcon, UndoIcon } from './icons';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { useCopyToClipboard } from 'usehooks-ts';
import { toast } from 'sonner';
import { ConsoleOutput, UIBlock } from './block';
import {
  Dispatch,
  memo,
  SetStateAction,
  startTransition,
  useCallback,
  useState,
  useEffect,
} from 'react';

interface BlockActionsProps {
  block: UIBlock;
  handleVersionChange: (type: 'next' | 'prev' | 'toggle' | 'latest') => void;
  currentVersionIndex: number;
  isCurrentVersion: boolean;
  mode: 'read-only' | 'edit' | 'diff';
  setConsoleOutputs: Dispatch<SetStateAction<Array<ConsoleOutput>>>;
}

const KERNEL_URL = process.env.NEXT_PUBLIC_KERNEL_URL;
const AUTH_TOKEN = process.env.KERNEL_AUTH_TOKEN;

export function RunCodeButton({
  block,
  setConsoleOutputs,
}: {
  block: UIBlock;
  setConsoleOutputs: Dispatch<SetStateAction<Array<ConsoleOutput>>>;
}) {
  const [ws, setWs] = useState<WebSocket | null>(null);

  const connectToKernel = useCallback(async () => {
    try {
      setConsoleOutputs(prev => [...prev, {
        id: generateUUID(),
        content: 'Connecting to Python kernel...',
        status: 'in_progress',
        type: 'text'
      }]);

      const socket = new WebSocket('ws://0.0.0.0:8000/ws');
      
      socket.onopen = () => {
        console.log('WebSocket opened');
        setConsoleOutputs(prev => [...prev, {
          id: generateUUID(),
          content: 'Connected to Python kernel',
          status: 'completed',
          type: 'text'
        }]);

        if (block.content) {
          console.log('Sending code:', block.content);
          socket.send(JSON.stringify({
            code: block.content
          }));
        }
      };

      socket.onmessage = (event) => {
        console.log('Received message:', event.data);
        try {
          const data = JSON.parse(event.data);
          setConsoleOutputs(prev => [...prev, {
            id: generateUUID(),
            content: data.content,
            status: data.status,
            type: 'text'
          }]);
        } catch (error) {
          console.error('Error processing message:', error);
          setConsoleOutputs(prev => [...prev, {
            id: generateUUID(),
            content: `Error processing message: ${(error as Error).message}`,
            status: 'failed',
            type: 'text'
          }]);
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConsoleOutputs(prev => [...prev, {
          id: generateUUID(),
          content: `WebSocket error: Connection failed`,
          status: 'failed',
          type: 'text'
        }]);
      };

      socket.onclose = (event) => {
        console.log('WebSocket closed:', event);
        setConsoleOutputs(prev => [...prev, {
          id: generateUUID(),
          content: `Connection closed (${event.code}: ${event.reason || 'No reason provided'})`,
          status: 'failed',
          type: 'text'
        }]);
      };

      setWs(socket);
    } catch (error) {
      console.error('Connection error:', error);
      setConsoleOutputs(prev => [...prev, {
        id: generateUUID(),
        content: `Connection error: ${(error as Error).message}`,
        status: 'failed',
        type: 'text'
      }]);
    }
  }, [block.content, setConsoleOutputs]);

  const handleRunClick = useCallback(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToKernel();
    } else {
      console.log('Sending code:', block.content);
      ws.send(JSON.stringify({
        code: block.content
      }));
    }
  }, [ws, block.content, connectToKernel]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          className="p-2 h-fit dark:hover:bg-zinc-700"
          onClick={handleRunClick}
        >
          <PlayIcon size={18} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Run code</TooltipContent>
    </Tooltip>
  );
}

function PureBlockActions({
  block,
  handleVersionChange,
  currentVersionIndex,
  isCurrentVersion,
  mode,
  setConsoleOutputs,
}: BlockActionsProps) {
  const [_, copyToClipboard] = useCopyToClipboard();

  return (
    <div className="flex flex-row gap-1">
      {block.kind === 'code' && (
        <RunCodeButton block={block} setConsoleOutputs={setConsoleOutputs} />
      )}

      {block.kind === 'text' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'p-2 h-fit !pointer-events-auto dark:hover:bg-zinc-700',
                {
                  'bg-muted': mode === 'diff',
                },
              )}
              onClick={() => {
                handleVersionChange('toggle');
              }}
              disabled={
                block.status === 'streaming' || currentVersionIndex === 0
              }
            >
              <ClockRewind size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View changes</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700 !pointer-events-auto"
            onClick={() => {
              handleVersionChange('prev');
            }}
            disabled={currentVersionIndex === 0 || block.status === 'streaming'}
          >
            <UndoIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View Previous version</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700 !pointer-events-auto"
            onClick={() => {
              handleVersionChange('next');
            }}
            disabled={isCurrentVersion || block.status === 'streaming'}
          >
            <RedoIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>View Next version</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            className="p-2 h-fit dark:hover:bg-zinc-700"
            onClick={() => {
              copyToClipboard(block.content);
              toast.success('Copied to clipboard!');
            }}
            disabled={block.status === 'streaming'}
          >
            <CopyIcon size={18} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy to clipboard</TooltipContent>
      </Tooltip>
    </div>
  );
}

export const BlockActions = memo(PureBlockActions, (prevProps, nextProps) => {
  if (prevProps.block.status !== nextProps.block.status) return false;
  if (prevProps.currentVersionIndex !== nextProps.currentVersionIndex)
    return false;
  if (prevProps.isCurrentVersion !== nextProps.isCurrentVersion) return false;

  return true;
});

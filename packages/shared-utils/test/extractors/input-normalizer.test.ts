import { describe, it, expect } from 'vitest';
import { AiSdkV4Strategy } from '../../src/normalizer/transformers/ai-sdk/strategies/v4';
import { AiSdkV5Strategy } from '../../src/normalizer/transformers/ai-sdk/strategies/v5';
import {
    StandardToolCallContent,
    StandardToolResultContent,
} from '../../src/normalizer/types';

describe('Input Normalization in Strategies', () => {
    describe('V4 Strategy - extractInput', () => {
        const v4Strategy = new AiSdkV4Strategy();

        it('should normalize V4 tool call messages (args field)', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'user',
                    content: 'Hello',
                },
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            args: { query: 'test' },
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(2);
            expect(normalized![1].role).toBe('assistant');
            
            const content = normalized![1].content as StandardToolCallContent[];
            expect(Array.isArray(content)).toBe(true);
            expect(content[0]).toEqual({
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                args: { query: 'test' },
            });
        });

        it('should normalize V4 tool result messages (result field)', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            result: { articles: ['article1', 'article2'] },
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(1);
            const content = normalized![0].content as StandardToolResultContent[];
            expect(content[0]).toEqual({
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                result: { articles: ['article1', 'article2'] },
            });
        });

        it('should handle plain string content', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'user',
                    content: 'Simple string message',
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(1);
            expect(normalized![0].content).toBe('Simple string message');
        });

        it('should handle text content parts', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Hello' },
                        { type: 'text', text: 'World' },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(1);
            const content = normalized![0].content as any[];
            expect(content).toHaveLength(2);
            expect(content[0]).toEqual({ type: 'text', text: 'Hello' });
            expect(content[1]).toEqual({ type: 'text', text: 'World' });
        });
    });

    describe('V5 Strategy - extractInput', () => {
        const v5Strategy = new AiSdkV5Strategy();

        it('should normalize V5 tool call messages (input field -> args)', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'user',
                    content: 'Hello',
                },
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call_456',
                            toolName: 'search',
                            input: { query: 'v5 test' },
                            providerOptions: { openai: { itemId: 'item_123' } },
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v5Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(2);
            expect(normalized![1].role).toBe('assistant');
            
            const content = normalized![1].content as StandardToolCallContent[];
            expect(Array.isArray(content)).toBe(true);
            expect(content[0].type).toBe('tool-call');
            expect(content[0].toolCallId).toBe('call_456');
            expect(content[0].toolName).toBe('search');
            // V5's 'input' should be normalized to 'args'
            expect(content[0].args).toEqual({ query: 'v5 test' });
        });

        it('should normalize V5 tool result messages (output.value -> result)', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call_456',
                            toolName: 'search',
                            output: {
                                type: 'json',
                                value: { articles: ['v5article1', 'v5article2'] },
                            },
                            providerOptions: { openai: { itemId: 'item_456' } },
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v5Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(1);
            const content = normalized![0].content as StandardToolResultContent[];
            expect(content[0].type).toBe('tool-result');
            expect(content[0].toolCallId).toBe('call_456');
            expect(content[0].toolName).toBe('search');
            // V5's output.value should be normalized to result
            expect(content[0].result).toEqual({ articles: ['v5article1', 'v5article2'] });
        });

        it('should handle mixed content (text + tool-call)', () => {
            const messagesJson = JSON.stringify([
                {
                    role: 'assistant',
                    content: [
                        { type: 'text', text: 'Let me search for that' },
                        {
                            type: 'tool-call',
                            toolCallId: 'call_789',
                            toolName: 'search',
                            input: { query: 'mixed content test' },
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v5Strategy.extractInput(attributes);

            expect(normalized).toHaveLength(1);
            const content = normalized![0].content as any[];
            expect(content).toHaveLength(2);
            expect(content[0]).toEqual({ type: 'text', text: 'Let me search for that' });
            expect(content[1].type).toBe('tool-call');
            expect(content[1].args).toEqual({ query: 'mixed content test' });
        });
    });

    describe('Cross-version normalization', () => {
        it('should normalize both V4 and V5 formats to the same standard', () => {
            const v4Strategy = new AiSdkV4Strategy();
            const v5Strategy = new AiSdkV5Strategy();

            // V4 format
            const v4MessagesJson = JSON.stringify([
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            args: { query: 'test' },
                        },
                    ],
                },
            ]);

            // V5 format (uses 'input' instead of 'args')
            const v5MessagesJson = JSON.stringify([
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            input: { query: 'test' },
                        },
                    ],
                },
            ]);

            const v4Normalized = v4Strategy.extractInput({ 'ai.prompt.messages': v4MessagesJson });
            const v5Normalized = v5Strategy.extractInput({ 'ai.prompt.messages': v5MessagesJson });

            // Both should have the same normalized structure
            const v4Content = v4Normalized![0].content as StandardToolCallContent[];
            const v5Content = v5Normalized![0].content as StandardToolCallContent[];

            expect(v4Content[0].args).toEqual(v5Content[0].args);
            expect(v4Content[0]).toEqual(v5Content[0]);
        });

        it('should normalize V4 result and V5 output.value to the same format', () => {
            const v4Strategy = new AiSdkV4Strategy();
            const v5Strategy = new AiSdkV5Strategy();

            const resultData = { data: 'test result' };

            // V4 format (uses 'result')
            const v4MessagesJson = JSON.stringify([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            result: resultData,
                        },
                    ],
                },
            ]);

            // V5 format (uses 'output.value')
            const v5MessagesJson = JSON.stringify([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            output: {
                                type: 'json',
                                value: resultData,
                            },
                        },
                    ],
                },
            ]);

            const v4Normalized = v4Strategy.extractInput({ 'ai.prompt.messages': v4MessagesJson });
            const v5Normalized = v5Strategy.extractInput({ 'ai.prompt.messages': v5MessagesJson });

            // Both should have the same normalized structure
            const v4Content = v4Normalized![0].content as StandardToolResultContent[];
            const v5Content = v5Normalized![0].content as StandardToolResultContent[];

            expect(v4Content[0].result).toEqual(v5Content[0].result);
            expect(v4Content[0]).toEqual(v5Content[0]);
        });
    });

    describe('Edge cases', () => {
        it('should handle messages with missing fields', () => {
            const v4Strategy = new AiSdkV4Strategy();
            
            const messagesJson = JSON.stringify([
                {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool-call',
                            // Missing toolCallId, toolName, args
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);
            const content = normalized![0].content as any[];
            expect(content[0].toolCallId).toBe('');
            expect(content[0].toolName).toBe('');
            expect(content[0].args).toEqual({});
        });

        it('should handle tool results with missing output/result', () => {
            const v5Strategy = new AiSdkV5Strategy();
            
            const messagesJson = JSON.stringify([
                {
                    role: 'tool',
                    content: [
                        {
                            type: 'tool-result',
                            toolCallId: 'call_123',
                            toolName: 'search',
                            // No result or output
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v5Strategy.extractInput(attributes);
            const content = normalized![0].content as any[];
            expect(content[0].result).toBeUndefined();
        });

        it('should preserve unknown content types', () => {
            const v4Strategy = new AiSdkV4Strategy();
            
            const messagesJson = JSON.stringify([
                {
                    role: 'user',
                    content: [
                        {
                            type: 'custom-type',
                            customField: 'custom-value',
                        },
                    ],
                },
            ]);

            const attributes = {
                'ai.prompt.messages': messagesJson,
            };

            const normalized = v4Strategy.extractInput(attributes);
            const content = normalized![0].content as any[];
            expect(content[0]).toEqual({
                type: 'custom-type',
                customField: 'custom-value',
            });
        });
    });
});

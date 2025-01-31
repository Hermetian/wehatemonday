import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import { cn } from '@/app/lib/utils/common'
import {
  Bold,
  Italic,
  Redo,
  Strikethrough,
  Undo,
  Link as LinkIcon,
  Underline as UnderlineIcon,
  Type
} from 'lucide-react'
import { Button } from './button'
import { Toggle } from './toggle'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import React from 'react'

const FONT_FAMILIES = [
  { label: 'Default', value: 'Inter var, sans-serif', class: 'font-sans' },
  { label: 'Serif', value: 'ui-serif, Georgia, Cambria, Times New Roman, Times, serif', class: 'font-serif' },
  { label: 'Mono', value: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', class: 'font-mono' },
  { label: 'Helvetica', value: 'Helvetica Neue, Helvetica, Arial, sans-serif', class: 'font-sans' },
  { label: 'Verdana', value: 'Verdana, sans-serif', class: 'font-sans' },
] as const;

interface MenuBarProps {
  editor: Editor | null
}

const MenuBar = ({ editor }: MenuBarProps) => {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt('Enter URL')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  const setFontFamily = (value: string) => {
    editor.chain().focus().setFontFamily(value).run()
  }

  const currentFont = editor.getAttributes('textStyle').fontFamily || FONT_FAMILIES[0].value

  return (
    <div className="border-t border-gray-200 p-2 flex flex-wrap gap-1 bg-gray-50 items-center">
      <TooltipProvider>
        <Select
          value={currentFont}
          onValueChange={setFontFamily}
        >
          <SelectTrigger className="h-8 w-[120px] text-xs border-gray-200">
            <Type className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Font" />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map(({ label, value, class: className }) => (
              <SelectItem key={value} value={value} className={className}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('bold')}
              onPressedChange={() => editor.chain().focus().toggleBold().run()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <Bold className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Bold</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('italic')}
              onPressedChange={() => editor.chain().focus().toggleItalic().run()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <Italic className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Italic</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('underline')}
              onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <UnderlineIcon className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Underline</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('strike')}
              onPressedChange={() => editor.chain().focus().toggleStrike().run()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <Strikethrough className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Strikethrough</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('link')}
              onPressedChange={addLink}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <LinkIcon className="h-4 w-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>Add Link</TooltipContent>
        </Tooltip>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <Undo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              className="text-gray-700 hover:bg-gray-200 data-[state=on]:bg-gray-200"
            >
              <Redo className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

interface RichTextEditorProps {
  content?: string
  onChange?: (html: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
}

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Write something...',
  className,
  readOnly = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily.configure({
        types: ['textStyle'],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          className
        ),
      },
    },
    immediatelyRender: false,
  })

  // Update editor content when prop changes
  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={cn('rounded-md border bg-white flex flex-col', className)}>
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none flex-1',
          'focus:outline-none p-3',
          'prose-p:text-gray-700 prose-p:m-0',
          'prose-a:text-blue-600',
          'min-h-[100px]',
          'bg-white selection:bg-blue-100'
        )}
      />
      {!readOnly && <MenuBar editor={editor} />}
    </div>
  )
}

export function RichTextContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  )
} 
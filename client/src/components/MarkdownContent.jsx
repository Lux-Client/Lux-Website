import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '../lib/utils'

marked.setOptions({ breaks: true, gfm: true })

export default function MarkdownContent({ content, className }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content || '')), [content])

  return <div className={cn('markdown-content', className)} dangerouslySetInnerHTML={{ __html: html }} />
}

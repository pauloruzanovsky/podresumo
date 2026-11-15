"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

/**
 * Número que sobe uma vez quando aparece (Magic UI, adaptado).
 *
 * Diferenças do original, todas de propósito:
 * - O HTML já sai com o valor certo. O original começava em 0, e quem lê o
 *   HTML sem rodar o JavaScript (Google, WhatsApp montando o cartão) via
 *   "0 livros".
 * - Formato brasileiro (5.544), não americano (5,544).
 * - Sem cor fixa: herda a do texto em volta, pra o tema escuro não quebrar.
 * - Quem pediu menos movimento no sistema vê o número parado. O CSS esconde o
 *   número só enquanto o JavaScript não assume (data-js, no layout), e mostra
 *   de novo quando a contagem começa ou quando não vai haver contagem.
 */

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  delay?: number
}

const formata = (n: number) => Math.round(n).toLocaleString("pt-BR")

export function NumberTicker({
  value,
  startValue = 0,
  delay = 0,
  className,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(startValue)
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 })
  const isInView = useInView(ref, { once: true, margin: "0px" })

  useEffect(() => {
    const el = ref.current
    if (!el || !isInView) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formata(value)
      el.dataset.pronto = ""
      return
    }
    el.textContent = formata(startValue)
    el.dataset.pronto = ""
    const timer = setTimeout(() => motionValue.set(value), delay * 1000)
    return () => clearTimeout(timer)
  }, [motionValue, isInView, delay, value, startValue])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) ref.current.textContent = formata(latest)
      }),
    [springValue]
  )

  return (
    <span ref={ref} data-ticker="" className={cn("tabular-nums", className)} {...props}>
      {formata(value)}
    </span>
  )
}

"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useTheme } from "next-themes"

function ThemeSchemeSync() {
    const { resolvedTheme } = useTheme()

    React.useEffect(() => {
        document.documentElement.style.colorScheme = resolvedTheme === "light" ? "light" : "dark"
    }, [resolvedTheme])

    return null
}

export function ThemeProvider({
    children,
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <ThemeSchemeSync />
            {children}
        </NextThemesProvider>
    )
}

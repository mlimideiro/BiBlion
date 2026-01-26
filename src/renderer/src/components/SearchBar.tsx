import React, { useState } from 'react'

interface Props {
    onSearch: (query: string) => void
}

export const SearchBar: React.FC<Props> = ({ onSearch }) => {
    const [query, setQuery] = useState('')

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        setQuery(val)
        onSearch(val)
    }

    return (
        <div className="search-bar">
            <input
                type="text"
                placeholder="Buscar por título, autor o ISBN..."
                value={query}
                onChange={handleChange}
                className="search-input"
            />
        </div>
    )
}

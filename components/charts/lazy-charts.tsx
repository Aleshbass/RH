'use client'

// @ts-nocheck
import React, { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// Simple interfaces to avoid deep type instantiation
interface ChartData {
  [key: string]: any
}

interface BaseChartProps {
  data: ChartData[]
  width?: number
  height?: number
  className?: string
}

// Loading component for charts
const ChartLoading = ({ className, message }: { className?: string; message?: string }) => (
  <div className={`space-y-3 ${className}`}>
    <Skeleton className="h-4 w-[250px]" />
    <Skeleton className="h-[200px] w-full" />
    {message && <p className="text-sm text-muted-foreground text-center">{message}</p>}
  </div>
)

// Chart error fallback
const ChartError = ({ error }: { error: Error }) => (
  <div className="flex items-center justify-center h-[200px] text-muted-foreground">
    <p>Failed to load chart: {error.message}</p>
  </div>
)

// Lazy load Recharts components to reduce bundle size
const LazyLineChart = lazy(
  () => import('recharts').then(mod => ({ 
    default: ({ data, dataKey, stroke = '#8884d8', ...props }: any) => {
      const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod
      return (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} {...props}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={dataKey || 'name'} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={dataKey || 'value'} stroke={stroke} />
          </LineChart>
        </ResponsiveContainer>
      )
    }
  }))
)

const LazyBarChart = lazy(
  () => import('recharts').then(mod => ({ 
    default: ({ data, dataKey, fill = '#8884d8', ...props }: any) => {
      const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = mod
      return (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} {...props}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={dataKey || 'name'} />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey={dataKey || 'value'} fill={fill} />
          </BarChart>
        </ResponsiveContainer>
      )
    }
  }))
)

const LazyPieChart = lazy(
  () => import('recharts').then(mod => ({ 
    default: ({ data, dataKey, ...props }: any) => {
      const { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } = mod
      const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']
      
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart {...props}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey={dataKey || 'value'}
            >
              {data.map((_: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      )
    }
  }))
)

// Wrapper components with loading states
export const OptimizedLineChart = (props: BaseChartProps) => (
  <Suspense fallback={<ChartLoading message="Loading chart..." />}>
    <LazyLineChart {...props} />
  </Suspense>
)

export const OptimizedBarChart = (props: BaseChartProps) => (
  <Suspense fallback={<ChartLoading message="Loading chart..." />}>
    <LazyBarChart {...props} />
  </Suspense>
)

export const OptimizedPieChart = (props: BaseChartProps) => (
  <Suspense fallback={<ChartLoading message="Loading chart..." />}>
    <LazyPieChart {...props} />
  </Suspense>
)

// Export types
export type { ChartData, BaseChartProps }

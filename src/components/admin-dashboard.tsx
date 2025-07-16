'use client'

import { useState, useEffect, useActionState, useRef } from 'react'
import { useForm, type SubmitHandler, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { User } from '@/app/page'
import {
  generateKeys,
  getKeys,
  deleteKey,
  deleteKeysByPrefix,
  logout,
  downloadProject,
  createModerator,
  getModerators,
  getModerator,
  deleteModerator,
  updateAllPrices,
  getPrices,
  clearModeratorDebt,
  UserState,
  PriceState,
} from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { KeyRound, Trash2, LogOut, Download, Search, XCircle, Archive, CheckCircle, X, Server, Clipboard, BookUser, ShieldPlus, UserX, UserCog, BadgeDollarSign, Save, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';


const generateKeysSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required').max(10),
  count: z.coerce.number().min(1, 'At least one key').max(100, 'Max 100 keys'),
  validityDays: z.coerce.number().min(1, 'Validity is required'),
})

const createModeratorSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

const updatePricesSchema = z.object({
    prices: z.record(z.coerce.number().min(0, 'Price must be non-negative'))
});

type GenerateKeysForm = z.infer<typeof generateKeysSchema>
type CreateModeratorForm = z.infer<typeof createModeratorSchema>;
type UpdatePricesForm = z.infer<typeof updatePricesSchema>;

type Key = { _id: string; key: string; prefix: string; expires: string | null; validityDays: number; activationDate: string | null; isActive: boolean; createdBy?: string; price?: number }
type Moderator = { _id: string; username: string; debt: number; createdAt: string };
type Price = { _id: string; validityDays: number; price: number };

const validityOptions = [
  { label: '1 Day', value: 1 },
  { label: '7 Days', value: 7 },
  { label: '30 Days', value: 30 },
  { label: '90 Days', value: 90 },
  { label: '365 Days', value: 365 },
  { label: 'Unlimited', value: 36500 }, // 100 years as 'unlimited'
]

const activationExample = `{
  "key": "YOUR_KEY_HERE"
}`;

const activationSuccessResponse = `{
  "success": true,
  "message": "Key activated successfully.",
  "expires": "2025-08-16"
}`;

const verificationExample = `{
  "key": "YOUR_KEY_HERE"
}`;

const verificationSuccessResponse = `{
  "valid": true,
  "message": "Key is active.",
  "expires": "2025-08-16"
}`;

const getValidityDisplay = (days: number) => {
    if (days >= 36500) return 'Unlimited'
    if (days >= 365) return `${days / 365} Year(s)`
    return `${days} Day(s)`
}

function CreateModeratorForm({ onModeratorCreated }: { onModeratorCreated: () => void }) {
    const [state, formAction] = useActionState<UserState, FormData>(createModerator, undefined);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const { register, formState: { errors, isSubmitting }, reset } = useForm<CreateModeratorForm>({
        resolver: zodResolver(createModeratorSchema),
    });

    useEffect(() => {
        if (state?.message) {
            toast({
                variant: state.success ? 'default' : 'destructive',
                title: state.success ? 'Success' : 'Error',
                description: state.message,
            });
            if (state.success) {
                reset();
                onModeratorCreated();
            }
        }
    }, [state]); // Reduced dependencies to only 'state'

    return (
        <form ref={formRef} action={formAction} className="space-y-4">
            <div>
                <Label htmlFor="username">Moderator Username</Label>
                <Input id="username" {...register('username')} />
                {errors.username && <p className="text-sm text-destructive mt-1">{errors.username.message}</p>}
            </div>
            <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" {...register('password')} />
                {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
                <ShieldPlus className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Creating...' : 'Create Moderator'}
            </Button>
        </form>
    );
}

function PriceManagement({ onPricesUpdated }: { onPricesUpdated: () => void }) {
    const [state, formAction] = useActionState<PriceState, FormData>(updateAllPrices, undefined);
    const { toast } = useToast();
    const formRef = useRef<HTMLFormElement>(null);
    const { register, handleSubmit, formState: { isSubmitting }, setValue } = useForm<UpdatePricesForm>();
    const [initialPrices, setInitialPrices] = useState<Price[]>([]);

    const fetchPrices = async () => {
        const fetchedPrices = await getPrices();
        const fullPriceList = validityOptions.map(opt => {
            const existing = fetchedPrices.find(p => p.validityDays === opt.value);
            const price = existing?.price ?? 0;
            setValue(`price-${opt.value}`, price);
            return { _id: existing?._id || opt.value.toString(), validityDays: opt.value, price: price };
        });
        setInitialPrices(fullPriceList);
    };

    useEffect(() => {
        fetchPrices();
    }, []);

    useEffect(() => {
        if (state?.message) {
            toast({
                variant: state.success ? 'default' : 'destructive',
                title: state.success ? 'Success' : 'Error',
                description: state.message,
            });
            if (state.success) {
                fetchPrices(); // Re-fetch to update the view
                onPricesUpdated();
            }
        }
    }, [state]); // Reduced dependencies

    return (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Управление ценами</CardTitle>
                <CardDescription>Установите цены для ключей разной длительности.</CardDescription>
            </CardHeader>
            <form ref={formRef} action={formAction} >
                <CardContent className="space-y-4">
                    {initialPrices.map(p => (
                        <div key={p.validityDays} className="flex items-center justify-between gap-4">
                            <Label htmlFor={`price-${p.validityDays}`} className="flex-1 whitespace-nowrap">
                                {getValidityDisplay(p.validityDays)}
                            </Label>
                            <Input
                                id={`price-${p.validityDays}`}
                                {...register(`price-${p.validityDays}`)}
                                name={`price-${p.validityDays}`}
                                type="number"
                                step="0.01"
                                defaultValue={p.price}
                                className="w-28"
                            />
                        </div>
                    ))}
                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSubmitting ? 'Сохранение...' : 'Сохранить все цены'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}


export default function AdminDashboard({ user }: { user: User }) {
  const [keys, setKeys] = useState<Key[]>([])
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [currentModerator, setCurrentModerator] = useState<Moderator | null>(null);
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDownloadingProject, setIsDownloadingProject] = useState(false)
  const [origin, setOrigin] = useState('')
  const { toast } = useToast()
  const isAdmin = user.role === 'admin';

  const {
    register,
    handleSubmit: handleKeySubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<GenerateKeysForm>({
    resolver: zodResolver(generateKeysSchema),
    defaultValues: { prefix: 'KEY', count: 10, validityDays: 30 },
  })
    
  useEffect(() => {
    // This code runs only on the client-side and gets the current domain
    setOrigin(window.location.origin);
  }, [])
  
  const fetchAllData = async () => {
    setLoading(true);
    const fetchedKeys = await getKeys(user);
    setKeys(fetchedKeys);
    if (isAdmin) {
      await fetchModerators();
    } else if (user.userId) {
       const modData = await getModerator(user.userId);
       setCurrentModerator(modData);
    }
    setLoading(false);
  };
  
  useEffect(() => {
    fetchAllData();
  }, [user]);
  
  const fetchModerators = async () => {
      const fetchedModerators = await getModerators();
      setModerators(fetchedModerators);
  };
  
  const copyToClipboard = (text: string, name: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to clipboard', description: `${name} copied.` });
  };


  const handleGenerate: SubmitHandler<GenerateKeysForm> = async (data) => {
    setIsGenerating(true)
    const { keys: newKeys } = await generateKeys(
      data.prefix,
      data.count,
      data.validityDays,
      user
    )
    if (newKeys && newKeys.length > 0) {
      const fileContent = newKeys
        .map(key => `${key.key}\t${getValidityDisplay(key.validityDays)}`)
        .join('\n');
      const blob = new Blob([fileContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.prefix}_keys.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast({ title: 'Success', description: `${data.count} keys generated and downloaded.` })
      reset()
    } else {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to generate keys.' })
    }
    await fetchAllData()
    setIsGenerating(false)
  }

  const handleDelete = async (key: string) => {
    await deleteKey(key)
    toast({ title: 'Key Deleted', description: `Key ${key} has been removed.` })
    await fetchAllData()
  }

  const handleDeleteByPrefix = async (prefix: string) => {
    if (!prefix) {
      toast({ variant: 'destructive', title: 'Error', description: 'Search term must be a valid prefix to delete.' })
      return
    }
    const { message } = await deleteKeysByPrefix(prefix);
    toast({ title: 'Bulk Delete Successful', description: message })
    await fetchAllData()
    setSearchTerm('')
  }
  
  const handleDeleteModerator = async (id: string) => {
      const result = await deleteModerator(id);
      toast({ title: result.success ? 'Success' : 'Error', description: result.message });
      if (result.success) {
        await fetchModerators();
      }
  };
  
  const handleClearDebt = async (id: string) => {
      const result = await clearModeratorDebt(id);
      toast({ 
          title: result.success ? 'Success' : 'Error',
          description: result.message
      });
      if (result.success) {
          await fetchModerators();
           if (!isAdmin && user.userId) { // Also update current moderator's view if they clear their own debt (edge case)
               const modData = await getModerator(user.userId);
               setCurrentModerator(modData);
           }
      }
  };
  
  const handleDownloadProject = async () => {
    setIsDownloadingProject(true);
    toast({ title: 'Project Archiving', description: 'Please wait, this may take a moment...' });
    try {
      const result = await downloadProject();
      if (result.success) {
        const a = document.createElement('a');
        a.href = `data:application/zip;base64,${result.file}`;
        a.download = result.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast({ title: 'Success', description: 'Project downloaded successfully.' });
      } else {
        throw new Error('Failed to download project');
      }
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not download the project.' });
    }
    setIsDownloadingProject(false);
  }

  const filteredKeys = keys.filter(
    (key) =>
      key.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      key.prefix.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (isAdmin && key.createdBy && key.createdBy.toLowerCase().includes(searchTerm.toLowerCase()))
  )
  
  const handlePricesUpdated = () => {
      fetchAllData();
  }

  return (
    <div className="flex flex-col min-h-screen p-4 sm:p-6 lg:p-8 bg-muted/20">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
            <KeyRound className="h-8 w-8 text-accent" />
            <h1 className="text-3xl font-bold text-foreground">MoonTool <span className="text-base font-medium text-muted-foreground">({user.username})</span></h1>
        </div>
         <div className="flex items-center gap-2">
            {!isAdmin && currentModerator && (
                <div className="flex items-center gap-2 text-lg font-semibold border border-dashed border-destructive/50 bg-destructive/10 text-destructive-foreground p-2 rounded-lg">
                    <Landmark className="h-5 w-5" />
                    <span>Долг: {currentModerator.debt.toFixed(2)}</span>
                </div>
            )}
            {isAdmin && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <BookUser className="mr-2 h-4 w-4" />
                      API Guide
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[625px]">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                         <Server className="h-5 w-5" />
                         API Usage Guide
                      </DialogTitle>
                      <DialogDescription>
                        How to interact with the key activation and verification API. The API base URL is determined by your deployment domain.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 text-sm py-4">
                        <div>
                            <h4 className="font-semibold mb-1">Key Activation Endpoint</h4>
                            <div className="relative mb-2">
                                <code className="block bg-muted p-2 rounded-md text-xs font-mono">POST {origin ? `${origin}/api/activate` : '.../api/activate'}</code>
                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" disabled={!origin} onClick={() => copyToClipboard(`${origin}/api/activate`, 'Activation URL')}><Clipboard className="h-4 w-4" /></Button>
                            </div>
                            <Label>Request Body (JSON)</Label>
                            <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{borderRadius: '0.5rem', margin: '0.25rem 0', fontSize: '0.8rem'}}>
                              {activationExample}
                            </SyntaxHighlighter>
                            <Label>Success Response (JSON)</Label>
                             <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{borderRadius: '0.5rem', marginTop: '0.25rem', fontSize: '0.8rem'}}>
                              {activationSuccessResponse}
                            </SyntaxHighlighter>
                        </div>
                         <div className="border-t pt-4">
                            <h4 className="font-semibold mb-1">Key Verification Endpoint</h4>
                             <div className="relative mb-2">
                                <code className="block bg-muted p-2 rounded-md text-xs font-mono">POST {origin ? `${origin}/api/verify` : '.../api/verify'}</code>
                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6" disabled={!origin} onClick={() => copyToClipboard(`${origin}/api/verify`, 'Verification URL')}><Clipboard className="h-4 w-4" /></Button>
                            </div>
                            <Label>Request Body (JSON)</Label>
                            <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{borderRadius: '0.5rem', margin: '0.25rem 0', fontSize: '0.8rem'}}>
                                {verificationExample}
                            </SyntaxHighlighter>
                            <Label>Success Response (JSON)</Label>
                            <SyntaxHighlighter language="json" style={vscDarkPlus} customStyle={{borderRadius: '0.5rem', marginTop: '0.25rem', fontSize: '0.8rem'}}>
                              {verificationSuccessResponse}
                            </SyntaxHighlighter>
                        </div>
                    </div>
                  </DialogContent>
                </Dialog>
            )}

           {isAdmin && (
            <Button variant="outline" onClick={handleDownloadProject} disabled={isDownloadingProject}>
                <Archive className="mr-2 h-4 w-4" />
                {isDownloadingProject ? 'Archiving...' : 'Download Project'}
            </Button>
           )}
           <form action={logout}>
             <Button variant="outline">
               <LogOut className="mr-2 h-4 w-4" />
               Logout
             </Button>
           </form>
         </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-1 space-y-8">
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Generate Keys</CardTitle>
              <CardDescription>
                Create new keys with a prefix and expiration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleKeySubmit(handleGenerate)} className="space-y-4">
                <div>
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input id="prefix" {...register('prefix')} />
                  {errors.prefix && (
                    <p className="text-sm text-destructive mt-1">{errors.prefix.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="count">Quantity</Label>
                  <Input id="count" type="number" {...register('count')} />
                  {errors.count && (
                    <p className="text-sm text-destructive mt-1">{errors.count.message}</p>
                  )}
                </div>
                <div>
                   <Label>Validity</Label>
                   <Controller
                      name="validityDays"
                      control={control}
                      render={({ field }) => (
                        <div className="grid grid-cols-3 gap-2 pt-2">
                          {validityOptions.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              variant={field.value === option.value ? 'default' : 'outline'}
                              onClick={() => field.onChange(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      )}
                    />
                  {errors.validityDays && (
                    <p className="text-sm text-destructive mt-1">{errors.validityDays.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isGenerating}>
                  <Download className="mr-2 h-4 w-4" />
                  {isGenerating ? 'Generating...' : 'Generate & Download'}
                </Button>
              </form>
            </CardContent>
          </Card>
           {isAdmin && (
             <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Moderator Management</CardTitle>
                    <CardDescription>Create and manage moderator accounts.</CardDescription>
                </CardHeader>
                <CardContent>
                    <CreateModeratorForm onModeratorCreated={fetchModerators} />
                </CardContent>
                <CardFooter className="flex flex-col items-start gap-4">
                    <h3 className="text-sm font-medium text-muted-foreground">Existing Moderators</h3>
                    <div className="w-full space-y-2">
                        {moderators.length > 0 ? moderators.map(mod => (
                            <div key={mod._id} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted">
                                <div className="flex items-center gap-4">
                                  <span>{mod.username}</span>
                                  <span className="text-xs font-mono text-destructive p-1 rounded bg-destructive/10">Долг: {mod.debt.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                            <Landmark className="h-4 w-4 text-green-500" />
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Погасить долг?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Вы уверены, что хотите обнулить долг для модератора "{mod.username}"? Текущий долг: {mod.debt.toFixed(2)}. Это действие нельзя отменить.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => handleClearDebt(mod._id)}>
                                                Погасить
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                  <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-6 w-6">
                                              <UserX className="h-4 w-4 text-destructive" />
                                          </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                          <AlertDialogHeader>
                                              <AlertDialogTitle>Delete Moderator?</AlertDialogTitle>
                                              <AlertDialogDescription>
                                                  Are you sure you want to delete the moderator "{mod.username}"? This will also delete all keys created by them. This action cannot be undone.
                                              </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                                              <AlertDialogAction onClick={() => handleDeleteModerator(mod._id)}>
                                                  Delete
                                              </AlertDialogAction>
                                          </AlertDialogFooter>
                                      </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                            </div>
                        )) : (
                            <p className="text-sm text-center text-muted-foreground py-2">No moderators found.</p>
                        )}
                    </div>
                </CardFooter>
             </Card>
           )}
           {isAdmin && <PriceManagement onPricesUpdated={handlePricesUpdated} />}
        </div>

        <div className="xl:col-span-2">
          <Card className="shadow-lg h-full">
            <CardHeader>
              <CardTitle>Generated Keys</CardTitle>
              <CardDescription>
                Search, view, and manage existing keys.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                        placeholder="Search by key, prefix, or creator..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                {isAdmin && (
                 <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={!searchTerm}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete by Prefix
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all keys with the prefix "{searchTerm}". This action cannot be undone.
                        </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteByPrefix(searchTerm)}>
                            Yes, delete all
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                )}
              </div>

              <div className="border rounded-md max-h-[600px] xl:max-h-[calc(100vh-280px)] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Prefix</TableHead>
                       {isAdmin && <TableHead>Created By</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead>Validity</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Activation Date</TableHead>
                      <TableHead>Expiration Date</TableHead>
                      {isAdmin && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 9 : 7} className="text-center py-8">
                          Loading keys...
                        </TableCell>
                      </TableRow>
                    ) : filteredKeys.length > 0 ? (
                      filteredKeys.map((item) => (
                        <TableRow key={item._id}>
                          <TableCell className="font-mono">{item.key}</TableCell>
                          <TableCell>{item.prefix}</TableCell>
                           {isAdmin && <TableCell><div className="flex items-center gap-2"><UserCog className="h-4 w-4 text-muted-foreground" />{item.createdBy || 'N/A'}</div></TableCell>}
                          <TableCell>
                            <div className="flex items-center gap-2">
                                {item.isActive ? <CheckCircle className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-muted-foreground" />}
                                <span>{item.isActive ? 'Active' : 'Inactive'}</span>
                            </div>
                          </TableCell>
                          <TableCell>{getValidityDisplay(item.validityDays)}</TableCell>
                          <TableCell>{item.price?.toFixed(2) ?? (isAdmin ? '0.00' : 'N/A')}</TableCell>
                          <TableCell>{item.activationDate || 'N/A'}</TableCell>
                          <TableCell>{item.expires || 'N/A'}</TableCell>
                           {isAdmin && (
                            <TableCell className="text-right">
                             <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete the key "{item.key}"? This cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(item.key)}>
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                           )}
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 9 : 7} className="text-center py-8">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <XCircle className="h-8 w-8" />
                                <p>No keys found.</p>
                                {searchTerm && <p>Try adjusting your search.</p>}
                            </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
